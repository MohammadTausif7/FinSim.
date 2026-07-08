from __future__ import annotations

import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from finsim_analytics import build_report, read_processed_transactions
from finsim_analytics.cli import main
from finsim_analytics.csv_io import AnalyticsInputError


FIXTURE = Path(__file__).parent / "fixtures" / "processed_transactions.csv"


class AnalyticsTests(unittest.TestCase):
    def test_report_builds_dashboard_ready_sections(self) -> None:
        transactions = read_processed_transactions(FIXTURE)

        report = build_report(transactions)

        self.assertEqual(len(report.monthly_summaries), 3)
        self.assertEqual(report.monthly_summaries[0].month, "2026-01")
        self.assertEqual(report.monthly_summaries[0].spending, Decimal("1452.60"))
        self.assertEqual(report.monthly_summaries[2].review_count, 1)
        self.assertEqual(report.forecast.target_month, "2026-04")
        self.assertEqual(report.forecast.confidence, "medium")
        self.assertEqual(report.forecast.method, "exponential smoothing with damped trend")
        self.assertLessEqual(report.forecast.low, report.forecast.expected_spending)
        self.assertGreaterEqual(report.forecast.high, report.forecast.expected_spending)
        self.assertTrue(report.category_breakdown)
        self.assertTrue(report.spending_trends)

    def test_anomalies_include_large_and_uncertain_transactions(self) -> None:
        report = build_report(read_processed_transactions(FIXTURE))
        reasons = {item.reason for item in report.anomaly_candidates}

        self.assertIn("Large single transaction", reasons)
        self.assertIn("Category needs human confirmation", reasons)

    def test_report_serializes_money_as_strings(self) -> None:
        report = build_report(read_processed_transactions(FIXTURE))

        payload = report.as_dict()

        self.assertIsInstance(payload["monthly_summaries"][0]["spending"], str)
        self.assertIsInstance(payload["forecast"]["expected_spending"], str)

    def test_reader_rejects_missing_contract_columns(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            path.write_text("transaction_id,posted_at\nx,2026-01-01\n", encoding="utf-8")

            with self.assertRaises(AnalyticsInputError):
                read_processed_transactions(path)

    def test_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "report.json"

            exit_code = main([str(FIXTURE), "--output", str(output)])

            self.assertEqual(exit_code, 0)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["forecast"]["target_month"], "2026-04")


if __name__ == "__main__":
    unittest.main()
