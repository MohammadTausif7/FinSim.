"""Coordinate validation, deduplication, cleaning, categorization, and reporting."""

from __future__ import annotations

from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Mapping

from .cleaning import clean_merchant, normalize_description
from .contracts import ContractError
from .csv_io import read_transactions
from .models import CategoryDecision, ProcessedTransaction, QualityReport, SourceTransaction
from .rules import Rulebook, canonical_category, load_rulebook


REVIEW_THRESHOLD = Decimal("0.70")
EXTRACTION_REVIEW_THRESHOLD = Decimal("0.75")


def process_files(
    input_paths: list[Path],
    rulebook_path: Path | None = None,
    merchant_rules: Mapping[str, str] | None = None,
) -> tuple[list[ProcessedTransaction], QualityReport]:
    if not input_paths:
        raise ValueError("At least one input CSV is required")
    rulebook = load_rulebook(rulebook_path)
    learned_rules = _validate_merchant_rules(merchant_rules or {}, rulebook)
    report = QualityReport(rulebook_version=rulebook.version, input_files=len(input_paths))
    unique: list[SourceTransaction] = []
    seen: dict[str, SourceTransaction] = {}

    for path in input_paths:
        rows = read_transactions(path)
        report.input_rows += len(rows)
        for row in rows:
            existing = seen.get(row.transaction_id)
            if existing is None:
                seen[row.transaction_id] = row
                unique.append(row)
                continue
            if existing.identity_values() != row.identity_values():
                raise ContractError(
                    f"Transaction id {row.transaction_id!r} appears with conflicting values"
                )
            report.duplicates_removed += 1

    processed = [_process_transaction(row, rulebook, learned_rules) for row in unique]
    processed.sort(key=lambda row: (row.source.posted_at, row.source.transaction_id))
    update_quality_report(processed, report)
    return processed, report


def update_quality_report(
    processed: list[ProcessedTransaction],
    report: QualityReport,
) -> QualityReport:
    """Refresh every metric that can change after category review."""

    report.output_rows = len(processed)
    report.categorized_rows = sum(row.category != "Other" for row in processed)
    report.review_rows = sum(row.needs_review for row in processed)
    report.low_extraction_rows = sum(
        row.source.extraction_confidence < EXTRACTION_REVIEW_THRESHOLD for row in processed
    )
    report.zero_amount_rows = sum(row.source.amount == 0 for row in processed)
    report.debit_total = sum(
        (-row.source.amount for row in processed if row.source.amount < 0),
        Decimal("0.00"),
    )
    report.credit_total = sum(
        (row.source.amount for row in processed if row.source.amount > 0),
        Decimal("0.00"),
    )
    report.category_counts = dict(Counter(row.category for row in processed))
    category_spend: dict[str, Decimal] = {}
    for row in processed:
        if row.source.amount >= 0:
            continue
        category_spend[row.category] = category_spend.get(row.category, Decimal("0.00")) - row.source.amount
    report.category_spend = category_spend
    report.warnings = [
        warning
        for warning in report.warnings
        if not warning.endswith("transactions need category review before analytics.")
    ]
    if report.review_rows:
        report.warnings.append(
            f"{report.review_rows} transactions need category review before analytics."
        )
    return report


def non_category_review_required(transaction: SourceTransaction) -> bool:
    """Keep data-quality concerns open after a person confirms the category."""

    return (
        transaction.extraction_confidence < EXTRACTION_REVIEW_THRESHOLD
        or transaction.amount == 0
    )


def _process_transaction(
    transaction: SourceTransaction,
    rulebook: Rulebook,
    merchant_rules: Mapping[str, str],
) -> ProcessedTransaction:
    merchant = clean_merchant(transaction.description_raw, rulebook.aliases)
    remembered_category = merchant_rules.get(normalize_description(merchant))
    decision = (
        CategoryDecision(remembered_category, "user_merchant", Decimal("1.00"))
        if remembered_category
        else rulebook.categorize(transaction, merchant)
    )
    needs_review = (
        decision.confidence < REVIEW_THRESHOLD
        or decision.category == "Other"
        or non_category_review_required(transaction)
    )
    return ProcessedTransaction(
        source=transaction,
        merchant_clean=merchant,
        category=decision.category,
        category_source=decision.source,
        category_confidence=decision.confidence,
        needs_review=needs_review,
    )


def _validate_merchant_rules(
    merchant_rules: Mapping[str, str],
    rulebook: Rulebook,
) -> dict[str, str]:
    validated: dict[str, str] = {}
    for merchant, category in merchant_rules.items():
        merchant_key = normalize_description(str(merchant))
        matched_category = canonical_category(str(category), rulebook)
        if not merchant_key:
            raise ValueError("A remembered merchant cannot be empty")
        if matched_category is None:
            raise ValueError(f"Remembered merchant {merchant!r} has an unknown category")
        validated[merchant_key] = matched_category
    return validated
