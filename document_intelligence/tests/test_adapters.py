from __future__ import annotations

import unittest
from pathlib import Path

from finsim_parser.extractors import PageText
from finsim_parser.pipeline import parse_pages


FIXTURES = Path(__file__).parent / "fixtures"


class AdapterTests(unittest.TestCase):
    def test_bank_of_america_text_uses_posting_dates_and_reconciles(self) -> None:
        text = (FIXTURES / "bank_of_america_text.txt").read_text(encoding="utf-8")
        result = parse_pages(
            FIXTURES / "bank_of_america_text.txt",
            [PageText(1, text, "text", 1.0)],
            source_statement_id="synthetic-bank-of-america",
        )

        self.assertEqual(result.metadata.institution, "bank_of_america")
        self.assertEqual(result.metadata.period_start.isoformat(), "2025-12-08")
        self.assertEqual(result.transactions[2].posted_at.isoformat(), "2026-01-04")
        self.assertEqual(
            [str(row.amount) for row in result.transactions],
            ["200.00", "-75.00", "-50.00", "10.00", "-3.00", "-5.00"],
        )
        self.assertEqual(result.transactions[3].transaction_type, "refund")
        self.assertEqual(result.transactions[4].transaction_type, "fee")
        self.assertEqual(result.transactions[5].transaction_type, "interest")
        self.assertEqual(result.reconciliation.status, "passed")

    def test_bank_of_america_checking_statement_is_supported(self) -> None:
        text = (FIXTURES / "bank_of_america_checking_text.txt").read_text(encoding="utf-8")
        result = parse_pages(
            FIXTURES / "bank_of_america_checking_text.txt",
            [PageText(1, text, "text", 1.0)],
            source_statement_id="synthetic-bank-of-america-checking",
        )

        self.assertEqual(result.metadata.institution, "bank_of_america")
        self.assertEqual(result.metadata.account_type, "checking")
        self.assertEqual(result.metadata.period_start.isoformat(), "2025-07-16")
        self.assertEqual(result.metadata.period_end.isoformat(), "2025-08-13")
        self.assertEqual(len(result.transactions), 8)
        self.assertEqual(
            [str(row.amount) for row in result.transactions],
            ["500.00", "491.13", "25.00", "705.56", "-673.54", "-500.00", "-25.00", "-1106.64"],
        )
        self.assertEqual(result.transactions[0].transaction_type, "transfer")
        self.assertEqual(result.transactions[1].transaction_type, "credit")
        self.assertEqual(result.transactions[4].transaction_type, "transfer")
        self.assertEqual(result.reconciliation.status, "passed")

    def test_midfirst_ocr_text_is_normalized_and_reconciled(self) -> None:
        text = (FIXTURES / "midfirst_ocr.txt").read_text(encoding="utf-8")
        result = parse_pages(
            FIXTURES / "midfirst_ocr.txt",
            [PageText(1, text, "ocr", 0.82)],
            source_statement_id="synthetic-midfirst",
        )

        self.assertEqual(result.metadata.institution, "midfirst")
        self.assertEqual([str(row.amount) for row in result.transactions], ["500.00", "-100.00", "-50.00"])
        self.assertIn("PAYROLL REFERENCE", result.transactions[0].description_raw)
        self.assertEqual(result.reconciliation.status, "passed")
        self.assertEqual(result.reconciliation.checked_running_balances, 3)

    def test_discover_searchable_text_keeps_categories_and_cross_year_dates(self) -> None:
        text = (FIXTURES / "discover_text.txt").read_text(encoding="utf-8")
        result = parse_pages(
            FIXTURES / "discover_text.txt",
            [PageText(1, text, "text", 1.0)],
            source_statement_id="synthetic-discover",
        )

        self.assertEqual(result.metadata.institution, "discover")
        self.assertEqual([str(row.amount) for row in result.transactions], ["200.00", "-75.00", "-25.00"])
        self.assertEqual(result.transactions[1].category_raw, "Groceries")
        self.assertEqual(result.transactions[2].posted_at.isoformat(), "2026-01-03")
        self.assertEqual(result.reconciliation.status, "passed")


if __name__ == "__main__":
    unittest.main()
