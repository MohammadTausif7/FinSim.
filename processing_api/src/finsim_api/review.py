"""Build helpful category review prompts for uncertain transactions."""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from finsim_transactions.cleaning import normalize_description
from finsim_transactions.models import ProcessedTransaction
from finsim_transactions.processor import EXTRACTION_REVIEW_THRESHOLD, REVIEW_THRESHOLD
from finsim_transactions.rules import Rulebook


DEBIT_FALLBACKS = ["Groceries", "Dining", "Shopping", "Transport", "Subscriptions", "Services", "Other"]
CREDIT_FALLBACKS = ["Income", "Transfers", "Refunds", "Credits", "Other"]


def review_reasons(rows: Iterable[ProcessedTransaction]) -> list[str]:
    """Explain why a grouped merchant still needs a person's decision."""

    reasons: list[str] = []
    group = list(rows)
    if any(row.category == "Other" for row in group):
        reasons.append("category_unknown")
    if any(row.category_confidence < REVIEW_THRESHOLD for row in group):
        reasons.append("low_category_confidence")
    if any(row.source.extraction_confidence < EXTRACTION_REVIEW_THRESHOLD for row in group):
        reasons.append("low_extraction_confidence")
    if any(row.source.amount == 0 for row in group):
        reasons.append("zero_amount")
    return reasons


def review_suggestions(
    rows: Iterable[ProcessedTransaction],
    *,
    rulebook: Rulebook,
    categories: set[str],
    limit: int = 5,
) -> list[str]:
    """Rank category choices using the current decision, keywords, and money direction."""

    group = list(rows)
    suggestions: list[str] = []
    for row in group:
        if row.category != "Other":
            _append_known(suggestions, row.category, categories)

    for category in _keyword_categories(group, rulebook):
        _append_known(suggestions, category, categories)

    debit_total = sum((-row.source.amount for row in group if row.source.amount < 0), Decimal("0.00"))
    credit_total = sum((row.source.amount for row in group if row.source.amount > 0), Decimal("0.00"))
    fallback_order = CREDIT_FALLBACKS if credit_total > debit_total else DEBIT_FALLBACKS
    for category in fallback_order:
        _append_known(suggestions, category, categories)

    return suggestions[:limit]


def review_summary(rows: Iterable[ProcessedTransaction]) -> str:
    """Return a short sentence the frontend can show on a review card."""

    reasons = set(review_reasons(rows))
    if "low_extraction_confidence" in reasons:
        return "The statement text was unclear, so this category should be confirmed."
    if "category_unknown" in reasons:
        return "FinSim could not confidently match this merchant to a category."
    if "low_category_confidence" in reasons:
        return "FinSim found a possible category, but confidence is below the review threshold."
    if "zero_amount" in reasons:
        return "This transaction has a zero amount and should be checked."
    return "This transaction needs a quick category check."


def _keyword_categories(
    rows: list[ProcessedTransaction],
    rulebook: Rulebook,
) -> list[str]:
    matches: list[str] = []
    for rule in rulebook.category_rules:
        allowed_types = {str(value) for value in rule.get("transaction_types", [])}
        keywords = [normalize_description(str(value)) for value in rule.get("keywords", [])]
        if not keywords:
            continue
        for row in rows:
            if allowed_types and row.source.transaction_type not in allowed_types:
                continue
            searchable = normalize_description(f"{row.source.description_raw} {row.merchant_clean}")
            if any(keyword in searchable for keyword in keywords):
                matches.append(str(rule["category"]))
                break
    return matches


def _append_known(target: list[str], category: str, categories: set[str]) -> None:
    if category in categories and category not in target:
        target.append(category)
