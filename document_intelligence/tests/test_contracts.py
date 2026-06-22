from __future__ import annotations

import csv
import tempfile
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

from finsim_parser.csv_writer import CSV_FIELDS, write_transactions
from finsim_parser.models import StatementMetadata, Transaction
from finsim_parser.reconcile import reconcile


class ContractTests(unittest.TestCase):
    def test_csv_contract_excludes_customer_and_account_identifiers(self) -> None:
        transaction = Transaction(
            transaction_id="sample-id",
            posted_at=date(2026, 1, 2),
            description_raw="SAMPLE MERCHANT",
            amount=Decimal("-12.34"),
            source_statement_id="sample-statement",
            page_number=1,
        )
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "transactions.csv"
            write_transactions(output, [transaction])
            with output.open(newline="", encoding="utf-8") as source:
                rows = list(csv.DictReader(source))

        self.assertEqual(list(rows[0]), CSV_FIELDS)
        self.assertNotIn("customer_name", rows[0])
        self.assertNotIn("account_number", rows[0])
        self.assertEqual(rows[0]["amount"], "-12.34")

    def test_reconciliation_warns_when_a_transaction_is_missing(self) -> None:
        metadata = StatementMetadata(
            institution="sample",
            account_type="checking",
            beginning_balance=Decimal("100.00"),
            ending_balance=Decimal("80.00"),
        )
        report = reconcile(metadata, [])
        self.assertEqual(report.status, "warning")
        self.assertEqual(report.difference, Decimal("20.00"))


if __name__ == "__main__":
    unittest.main()
