from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from finsim_transactions.feedback import (
    FeedbackDecision,
    FeedbackError,
    apply_feedback,
    parse_feedback_payload,
    read_merchant_rules,
    write_feedback_audit,
    write_merchant_rules,
)
from finsim_transactions.processor import process_files


FIXTURES = Path(__file__).parent / "fixtures"
RECORDED_AT = datetime(2026, 6, 22, 18, 30, tzinfo=timezone.utc)


class FeedbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.transactions, self.report = process_files([FIXTURES / "transactions.csv"])

    def test_user_choice_updates_only_the_matching_transaction(self) -> None:
        result = apply_feedback(
            self.transactions,
            [FeedbackDecision("tx-unknown", "shopping")],
            quality_report=self.report,
            recorded_at=RECORDED_AT,
        )
        by_id = {row.source.transaction_id: row for row in result.transactions}

        self.assertEqual(by_id["tx-unknown"].category, "Shopping")
        self.assertEqual(by_id["tx-unknown"].category_source, "user")
        self.assertEqual(by_id["tx-unknown"].category_confidence, Decimal("1.00"))
        self.assertFalse(by_id["tx-unknown"].needs_review)
        self.assertEqual(by_id["tx-grocery"].category, "Groceries")
        self.assertEqual(result.audit_records[0].original_category, "Other")
        self.assertEqual(result.audit_records[0].selected_category, "Shopping")
        self.assertIsNotNone(result.quality_report)
        self.assertEqual(result.quality_report.review_rows, 0)
        self.assertEqual(result.quality_report.category_spend["Shopping"], Decimal("20.00"))
        self.assertFalse(result.quality_report.warnings)
        self.assertEqual(self.report.review_rows, 1)

    def test_invalid_category_and_unknown_transaction_are_rejected(self) -> None:
        with self.assertRaisesRegex(FeedbackError, "not supported"):
            apply_feedback(
                self.transactions,
                [FeedbackDecision("tx-unknown", "Mystery")],
            )
        with self.assertRaisesRegex(FeedbackError, "was not found"):
            apply_feedback(
                self.transactions,
                [FeedbackDecision("missing", "Shopping")],
            )

    def test_duplicate_feedback_is_rejected(self) -> None:
        decisions = [
            FeedbackDecision("tx-unknown", "Shopping"),
            FeedbackDecision("tx-unknown", "Dining"),
        ]
        with self.assertRaisesRegex(FeedbackError, "more than one decision"):
            apply_feedback(self.transactions, decisions)

    def test_extraction_concern_remains_open_after_category_review(self) -> None:
        unknown = next(row for row in self.transactions if row.source.transaction_id == "tx-unknown")
        low_confidence = replace(
            unknown,
            source=replace(unknown.source, extraction_confidence=Decimal("0.50")),
        )
        rows = [low_confidence if row is unknown else row for row in self.transactions]

        result = apply_feedback(rows, [FeedbackDecision("tx-unknown", "Shopping")])
        reviewed = next(
            row for row in result.transactions if row.source.transaction_id == "tx-unknown"
        )
        self.assertTrue(reviewed.needs_review)

    def test_remembered_merchant_applies_to_a_later_processing_job(self) -> None:
        result = apply_feedback(
            self.transactions,
            [FeedbackDecision("tx-unknown", "Education", remember_merchant=True)],
        )
        later_rows, later_report = process_files(
            [FIXTURES / "transactions.csv"],
            merchant_rules=result.merchant_rules,
        )
        learned = next(row for row in later_rows if row.source.transaction_id == "tx-unknown")

        self.assertEqual(result.merchant_rules, {"LOCAL VENDOR": "Education"})
        self.assertEqual(learned.category, "Education")
        self.assertEqual(learned.category_source, "user_merchant")
        self.assertFalse(learned.needs_review)
        self.assertEqual(later_report.review_rows, 0)

    def test_invalid_stored_merchant_rule_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown category"):
            process_files(
                [FIXTURES / "transactions.csv"],
                merchant_rules={"LOCAL VENDOR": "Mystery"},
            )

    def test_feedback_payload_requires_the_frontend_contract(self) -> None:
        decisions = parse_feedback_payload(
            [{"transaction_id": "tx-unknown", "category": "Shopping", "remember_merchant": True}]
        )
        self.assertEqual(decisions[0], FeedbackDecision("tx-unknown", "Shopping", True))
        with self.assertRaisesRegex(FeedbackError, "remember_merchant"):
            parse_feedback_payload(
                [{"transaction_id": "tx-unknown", "category": "Shopping", "remember_merchant": "yes"}]
            )

    def test_audit_and_merchant_rules_can_be_saved_for_the_api_layer(self) -> None:
        result = apply_feedback(
            self.transactions,
            [FeedbackDecision("tx-unknown", "Shopping", remember_merchant=True)],
            recorded_at=RECORDED_AT,
        )
        with tempfile.TemporaryDirectory() as directory:
            audit_path = Path(directory) / "audit.json"
            rules_path = Path(directory) / "merchant-rules.json"
            write_feedback_audit(audit_path, result.audit_records)
            write_merchant_rules(rules_path, result.merchant_rules)

            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            restored_rules = read_merchant_rules(rules_path)

        self.assertEqual(audit[0]["transaction_id"], "tx-unknown")
        self.assertEqual(audit[0]["original_category"], "Other")
        self.assertEqual(audit[0]["original_category_confidence"], "0.25")
        self.assertEqual(audit[0]["recorded_at"], "2026-06-22T18:30:00Z")
        self.assertEqual(restored_rules, {"LOCAL VENDOR": "Shopping"})


if __name__ == "__main__":
    unittest.main()
