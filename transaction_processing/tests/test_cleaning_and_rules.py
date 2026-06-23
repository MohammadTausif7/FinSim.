from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from finsim_transactions.cleaning import clean_merchant, normalize_description
from finsim_transactions.models import SourceTransaction
from finsim_transactions.rules import load_rulebook


def sample_transaction(**changes) -> SourceTransaction:
    values = {
        "transaction_id": "sample",
        "posted_at": date(2026, 1, 2),
        "description_raw": "LOCAL SHOP",
        "amount": Decimal("-10.00"),
        "currency": "USD",
        "transaction_type": "debit",
        "balance": None,
        "category_raw": None,
        "source_statement_id": "statement",
        "page_number": 1,
        "extraction_method": "text",
        "extraction_confidence": Decimal("1.00"),
        "pipeline_version": "0.1.0",
    }
    values.update(changes)
    return SourceTransaction(**values)


class CleaningAndRuleTests(unittest.TestCase):
    def test_description_normalization_is_repeatable(self) -> None:
        self.assertEqual(normalize_description("  Café   Shop  "), "CAFÉ SHOP")

    def test_merchant_cleaning_removes_statement_noise_and_uses_alias(self) -> None:
        rulebook = load_rulebook()
        merchant = clean_merchant("POS STARBUCKS REF#ABCD1234 405-555-1212 OK", rulebook.aliases)
        self.assertEqual(merchant, "Starbucks")

    def test_bank_category_has_priority_over_keyword_rules(self) -> None:
        rulebook = load_rulebook()
        transaction = sample_transaction(
            description_raw="SAMPLE CAFE",
            category_raw="Travel/Entertainment",
        )
        decision = rulebook.categorize(transaction, "Sample Cafe")
        self.assertEqual(decision.category, "Travel")
        self.assertEqual(decision.source, "bank")

    def test_unknown_credit_is_flaggable_instead_of_assumed_income(self) -> None:
        rulebook = load_rulebook()
        transaction = sample_transaction(amount=Decimal("10.00"), transaction_type="credit")
        decision = rulebook.categorize(transaction, "Local Shop")
        self.assertEqual(decision.category, "Credits")
        self.assertEqual(decision.confidence, Decimal("0.40"))


if __name__ == "__main__":
    unittest.main()
