"""Apply category feedback while keeping the original decision traceable."""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Sequence

from .cleaning import normalize_description
from .models import ProcessedTransaction, QualityReport
from .processor import non_category_review_required, update_quality_report
from .rules import Rulebook, canonical_category, load_rulebook


class FeedbackError(ValueError):
    """Raised when category feedback cannot be safely applied."""


@dataclass(frozen=True, slots=True)
class FeedbackDecision:
    transaction_id: str
    category: str
    remember_merchant: bool = False


@dataclass(frozen=True, slots=True)
class FeedbackAuditRecord:
    transaction_id: str
    merchant_clean: str
    original_category: str
    original_category_source: str
    original_category_confidence: Decimal
    selected_category: str
    remember_merchant: bool
    recorded_at: datetime

    def as_dict(self) -> dict[str, str | bool]:
        return {
            "transaction_id": self.transaction_id,
            "merchant_clean": self.merchant_clean,
            "original_category": self.original_category,
            "original_category_source": self.original_category_source,
            "original_category_confidence": format(
                self.original_category_confidence,
                ".2f",
            ),
            "selected_category": self.selected_category,
            "remember_merchant": self.remember_merchant,
            "recorded_at": self.recorded_at.isoformat().replace("+00:00", "Z"),
        }


@dataclass(frozen=True, slots=True)
class FeedbackResult:
    transactions: list[ProcessedTransaction]
    audit_records: list[FeedbackAuditRecord]
    merchant_rules: dict[str, str]
    quality_report: QualityReport | None


def parse_feedback_payload(payload: object) -> list[FeedbackDecision]:
    """Validate the small JSON contract sent by the transaction review dialog."""

    if not isinstance(payload, list) or not payload:
        raise FeedbackError("Feedback must contain at least one decision")
    decisions: list[FeedbackDecision] = []
    for position, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise FeedbackError(f"Feedback decision {position} must be an object")
        transaction_id = item.get("transaction_id")
        category = item.get("category")
        remember = item.get("remember_merchant", False)
        if not isinstance(transaction_id, str) or not transaction_id.strip():
            raise FeedbackError(f"Feedback decision {position} requires transaction_id")
        if not isinstance(category, str) or not category.strip():
            raise FeedbackError(f"Feedback decision {position} requires category")
        if not isinstance(remember, bool):
            raise FeedbackError(
                f"Feedback decision {position} has an invalid remember_merchant value"
            )
        decisions.append(
            FeedbackDecision(
                transaction_id=transaction_id.strip(),
                category=" ".join(category.split()),
                remember_merchant=remember,
            )
        )
    return decisions


def apply_feedback(
    transactions: Sequence[ProcessedTransaction],
    decisions: Sequence[FeedbackDecision],
    *,
    existing_merchant_rules: Mapping[str, str] | None = None,
    quality_report: QualityReport | None = None,
    rulebook_path: Path | None = None,
    recorded_at: datetime | None = None,
) -> FeedbackResult:
    """Apply user choices and return revised rows, audit records, and learned rules."""

    if not decisions:
        raise FeedbackError("At least one feedback decision is required")
    timestamp = recorded_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise FeedbackError("Feedback recorded_at must include a timezone")

    rulebook = load_rulebook(rulebook_path)
    rows_by_id = {row.source.transaction_id: row for row in transactions}
    if len(rows_by_id) != len(transactions):
        raise FeedbackError("Processed transactions contain duplicate transaction ids")

    remembered = _validate_existing_rules(existing_merchant_rules or {}, rulebook)
    updated_by_id: dict[str, ProcessedTransaction] = {}
    audit_records: list[FeedbackAuditRecord] = []
    seen_decisions: set[str] = set()

    for decision in decisions:
        transaction_id = decision.transaction_id.strip()
        if transaction_id in seen_decisions:
            raise FeedbackError(f"Transaction {transaction_id!r} has more than one decision")
        seen_decisions.add(transaction_id)

        original = rows_by_id.get(transaction_id)
        if original is None:
            raise FeedbackError(f"Transaction {transaction_id!r} was not found")
        selected_category = canonical_category(decision.category, rulebook)
        if selected_category is None:
            raise FeedbackError(f"Category {decision.category!r} is not supported")

        updated_by_id[transaction_id] = replace(
            original,
            category=selected_category,
            category_source="user",
            category_confidence=Decimal("1.00"),
            needs_review=non_category_review_required(original.source),
        )
        if decision.remember_merchant:
            merchant_key = normalize_description(original.merchant_clean)
            if not merchant_key:
                raise FeedbackError(
                    f"Transaction {transaction_id!r} does not have a merchant to remember"
                )
            remembered[merchant_key] = selected_category
        audit_records.append(
            FeedbackAuditRecord(
                transaction_id=transaction_id,
                merchant_clean=original.merchant_clean,
                original_category=original.category,
                original_category_source=original.category_source,
                original_category_confidence=original.category_confidence,
                selected_category=selected_category,
                remember_merchant=decision.remember_merchant,
                recorded_at=timestamp,
            )
        )

    revised = [updated_by_id.get(row.source.transaction_id, row) for row in transactions]
    refreshed_report = (
        update_quality_report(revised, deepcopy(quality_report))
        if quality_report is not None
        else None
    )
    return FeedbackResult(
        transactions=revised,
        audit_records=audit_records,
        merchant_rules=dict(sorted(remembered.items())),
        quality_report=refreshed_report,
    )


def write_feedback_audit(path: Path, records: Sequence[FeedbackAuditRecord]) -> None:
    """Write one job's review history atomically as human-readable JSON."""

    _write_json(path, [record.as_dict() for record in records])


def write_merchant_rules(path: Path, merchant_rules: Mapping[str, str]) -> None:
    """Persist the user's learned merchant choices for later processing jobs."""

    _write_json(path, {"version": "0.1.0", "merchants": dict(sorted(merchant_rules.items()))})


def read_merchant_rules(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Merchant rules file not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise FeedbackError(f"Merchant rules are not valid JSON: {error.msg}") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("merchants"), dict):
        raise FeedbackError("Merchant rules require a merchants object")
    merchants = payload["merchants"]
    if not all(isinstance(key, str) and isinstance(value, str) for key, value in merchants.items()):
        raise FeedbackError("Merchant rule names and categories must be strings")
    return dict(merchants)


def _validate_existing_rules(
    merchant_rules: Mapping[str, str],
    rulebook: Rulebook,
) -> dict[str, str]:
    validated: dict[str, str] = {}
    for merchant, category in merchant_rules.items():
        merchant_key = normalize_description(str(merchant))
        selected_category = canonical_category(str(category), rulebook)
        if not merchant_key:
            raise FeedbackError("A remembered merchant cannot be empty")
        if selected_category is None:
            raise FeedbackError(f"Remembered merchant {merchant!r} has an unsupported category")
        validated[merchant_key] = selected_category
    return validated


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
