from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from finsim_api.review import review_reasons, review_suggestions, review_summary
from finsim_transactions.models import ProcessedTransaction, SourceTransaction
from finsim_transactions.rules import available_categories, load_rulebook


def processed_row(**changes) -> ProcessedTransaction:
    source_values = {
        "transaction_id": "tx-review",
        "posted_at": date(2026, 6, 3),
        "description_raw": "UNKNOWN MARKET",
        "amount": Decimal("-24.18"),
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
    row_values = {
        "merchant_clean": "Unknown Market",
        "category": "Other",
        "category_source": "fallback",
        "category_confidence": Decimal("0.25"),
        "needs_review": True,
    }
    source_updates = changes.pop("source", {})
    source_values.update(source_updates)
    row_values.update(changes)
    return ProcessedTransaction(source=SourceTransaction(**source_values), **row_values)


class ReviewHelperTests(unittest.TestCase):
    def test_review_reasons_explain_uncertain_rows(self) -> None:
        row = processed_row(
            source={"extraction_confidence": Decimal("0.50")},
        )

        self.assertEqual(
            review_reasons([row]),
            ["category_unknown", "low_category_confidence", "low_extraction_confidence"],
        )
        self.assertIn("unclear", review_summary([row]))

    def test_suggestions_use_keywords_before_generic_fallbacks(self) -> None:
        rulebook = load_rulebook()
        row = processed_row(
            source={"description_raw": "RIVERFRONT COFFEE REF 9944"},
        )

        suggestions = review_suggestions(
            [row],
            rulebook=rulebook,
            categories=available_categories(rulebook),
        )

        self.assertEqual(suggestions[0], "Dining")
        self.assertIn("Shopping", suggestions)

    def test_credit_reviews_get_credit_focused_choices(self) -> None:
        rulebook = load_rulebook()
        row = processed_row(
            source={
                "description_raw": "UNKNOWN CREDIT",
                "amount": Decimal("80.00"),
                "transaction_type": "credit",
            },
            category_confidence=Decimal("0.40"),
        )

        suggestions = review_suggestions(
            [row],
            rulebook=rulebook,
            categories=available_categories(rulebook),
        )

        self.assertEqual(suggestions[:3], ["Income", "Transfers", "Refunds"])


if __name__ == "__main__":
    unittest.main()
