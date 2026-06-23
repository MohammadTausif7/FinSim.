from __future__ import annotations

import csv
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from finsim_transactions.csv_io import OUTPUT_FIELDS, write_processed
from finsim_transactions.processor import process_files


FIXTURES = Path(__file__).parent / "fixtures"


class ProcessingTests(unittest.TestCase):
    def test_pipeline_cleans_categorizes_deduplicates_and_reports(self) -> None:
        transactions, report = process_files([FIXTURES / "transactions.csv"])
        by_id = {transaction.source.transaction_id: transaction for transaction in transactions}

        self.assertEqual(report.input_rows, 8)
        self.assertEqual(report.output_rows, 7)
        self.assertEqual(report.duplicates_removed, 1)
        self.assertEqual(report.review_rows, 1)
        self.assertEqual(report.debit_total, Decimal("229.19"))
        self.assertEqual(report.credit_total, Decimal("2500.00"))
        self.assertEqual(report.category_spend["Groceries"], Decimal("82.45"))
        self.assertEqual(by_id["tx-payroll"].category, "Income")
        self.assertEqual(by_id["tx-grocery"].merchant_clean, "Whole Foods Market")
        self.assertEqual(by_id["tx-grocery"].category, "Groceries")
        self.assertEqual(by_id["tx-coffee"].merchant_clean, "Starbucks")
        self.assertEqual(by_id["tx-streaming"].category, "Subscriptions")
        self.assertEqual(by_id["tx-streaming"].merchant_clean, "Netflix")
        self.assertEqual(by_id["tx-fee"].category_source, "transaction_type")
        self.assertTrue(by_id["tx-unknown"].needs_review)
        self.assertEqual(by_id["tx-travel"].category_source, "bank")

    def test_output_contract_uses_strings_for_money_and_review_flags(self) -> None:
        transactions, _ = process_files([FIXTURES / "transactions.csv"])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "cleaned.csv"
            write_processed(output, transactions)
            with output.open(newline="", encoding="utf-8") as source:
                rows = list(csv.DictReader(source))

        self.assertEqual(list(rows[0]), OUTPUT_FIELDS)
        self.assertEqual(rows[0]["amount"], "2500.00")
        self.assertIn(rows[-1]["needs_review"], {"true", "false"})


if __name__ == "__main__":
    unittest.main()
