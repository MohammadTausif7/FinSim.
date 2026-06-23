"""Load and apply the human editable transaction category rulebook."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from importlib.resources import files
from pathlib import Path

from .cleaning import normalize_description
from .models import CategoryDecision, SourceTransaction


RAW_CATEGORY_MAP = {
    "department store": "Shopping",
    "gasoline": "Transport",
    "groceries": "Groceries",
    "home improvement": "Housing",
    "merchandise": "Shopping",
    "restaurants": "Dining",
    "services": "Services",
    "supermarkets": "Groceries",
    "travel/entertainment": "Travel",
}

TYPE_CATEGORIES = {
    "fee": ("Fees", "0.99"),
    "interest": ("Interest", "0.99"),
    "payment": ("Payments", "0.99"),
    "transfer": ("Transfers", "0.95"),
}


@dataclass(frozen=True, slots=True)
class Rulebook:
    version: str
    aliases: list[dict[str, object]]
    category_rules: list[dict[str, object]]

    def categorize(self, transaction: SourceTransaction, merchant: str) -> CategoryDecision:
        if transaction.category_raw:
            mapped = RAW_CATEGORY_MAP.get(transaction.category_raw.strip().lower())
            if mapped:
                return CategoryDecision(mapped, "bank", Decimal("0.95"))

        type_category = TYPE_CATEGORIES.get(transaction.transaction_type)
        if type_category:
            return CategoryDecision(type_category[0], "transaction_type", Decimal(type_category[1]))

        searchable = normalize_description(f"{transaction.description_raw} {merchant}")
        for rule in self.category_rules:
            allowed_types = {str(value) for value in rule.get("transaction_types", [])}
            if allowed_types and transaction.transaction_type not in allowed_types:
                continue
            keywords = [str(value).upper() for value in rule.get("keywords", [])]
            if keywords and any(keyword in searchable for keyword in keywords):
                return CategoryDecision(
                    str(rule["category"]),
                    "rulebook",
                    Decimal(str(rule["confidence"])),
                )

        if transaction.transaction_type == "refund":
            return CategoryDecision("Refunds", "transaction_type", Decimal("0.70"))
        if transaction.amount > 0:
            return CategoryDecision("Credits", "fallback", Decimal("0.40"))
        return CategoryDecision("Other", "fallback", Decimal("0.25"))


def load_rulebook(path: Path | None = None) -> Rulebook:
    if path:
        content = path.read_text(encoding="utf-8")
    else:
        content = files("finsim_transactions").joinpath("data/category_rules.json").read_text(
            encoding="utf-8"
        )
    try:
        data = json.loads(content)
    except json.JSONDecodeError as error:
        raise ValueError(f"Category rulebook is not valid JSON: {error.msg}") from error
    _validate_rulebook(data)
    return Rulebook(
        version=str(data["version"]),
        aliases=list(data.get("merchant_aliases", [])),
        category_rules=sorted(
            data.get("category_rules", []),
            key=lambda rule: int(rule.get("priority", 1000)),
        ),
    )


def _validate_rulebook(data: object) -> None:
    if not isinstance(data, dict) or not str(data.get("version", "")).strip():
        raise ValueError("Category rulebook requires a version")
    rules = data.get("category_rules")
    if not isinstance(rules, list) or not rules:
        raise ValueError("Category rulebook requires at least one category rule")
    for position, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict) or not str(rule.get("category", "")).strip():
            raise ValueError(f"Category rule {position} requires a category")
        keywords = rule.get("keywords")
        if not isinstance(keywords, list) or not keywords:
            raise ValueError(f"Category rule {position} requires keywords")
        try:
            confidence = Decimal(str(rule["confidence"]))
        except (InvalidOperation, KeyError, ValueError) as error:
            raise ValueError(f"Category rule {position} has invalid confidence") from error
        if not Decimal("0.00") <= confidence <= Decimal("1.00"):
            raise ValueError(f"Category rule {position} has confidence outside 0 to 1")
