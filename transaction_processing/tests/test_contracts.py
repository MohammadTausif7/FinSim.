from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from finsim_transactions.contracts import ContractError
from finsim_transactions.processor import process_files
from finsim_transactions.rules import load_rulebook


FIXTURES = Path(__file__).parent / "fixtures"


class ContractTests(unittest.TestCase):
    def test_invalid_custom_rulebook_stops_processing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rules.json"
            path.write_text('{"version": "1", "category_rules": []}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "at least one category rule"):
                load_rulebook(path)

    def test_missing_required_column_stops_processing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.csv"
            path.write_text("transaction_id,amount\nsample,-1.00\n", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "missing required columns"):
                process_files([path])

    def test_conflicting_duplicate_id_stops_processing(self) -> None:
        with (FIXTURES / "transactions.csv").open(newline="", encoding="utf-8") as source:
            rows = list(csv.DictReader(source))
            fieldnames = list(rows[0])
        conflicting = rows[0].copy()
        conflicting["amount"] = "999.00"
        rows.append(conflicting)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "conflict.csv"
            with path.open("w", newline="", encoding="utf-8") as output:
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaisesRegex(ContractError, "conflicting values"):
                process_files([path])


if __name__ == "__main__":
    unittest.main()
