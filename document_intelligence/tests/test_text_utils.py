from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from finsim_parser.detector import UnsupportedStatementError, select_adapter
from finsim_parser.extractors import PageText
from finsim_parser.text_utils import infer_date, money, stable_transaction_id


class TextUtilityTests(unittest.TestCase):
    def test_money_handles_commas_signs_and_parentheses(self) -> None:
        self.assertEqual(money("$1,234.56"), Decimal("1234.56"))
        self.assertEqual(money("-42.10"), Decimal("-42.10"))
        self.assertEqual(money("($7.25)"), Decimal("-7.25"))

    def test_date_inference_handles_a_statement_that_crosses_new_year(self) -> None:
        self.assertEqual(infer_date(12, 31, date(2026, 1, 7)), date(2025, 12, 31))
        self.assertEqual(infer_date(1, 2, date(2026, 1, 7)), date(2026, 1, 2))

    def test_transaction_ids_are_repeatable_but_keep_duplicate_rows_distinct(self) -> None:
        values = ("statement", date(2026, 1, 2), "Sample Merchant", Decimal("-5.00"))
        first = stable_transaction_id(*values, 0)
        self.assertEqual(first, stable_transaction_id(*values, 0))
        self.assertNotEqual(first, stable_transaction_id(*values, 1))

    def test_unknown_layout_is_rejected_instead_of_guessed(self) -> None:
        with self.assertRaises(UnsupportedStatementError):
            select_adapter([PageText(1, "Generic document", "text", 1.0)])


if __name__ == "__main__":
    unittest.main()
