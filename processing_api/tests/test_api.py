from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
import tempfile
from unittest.mock import patch

from fastapi.testclient import TestClient

from finsim_api.accounts import AccountService
from finsim_api.app import _cors_origins, create_app
from finsim_api.service import ProcessingService
from finsim_api.storage import UserDataStore
from finsim_parser.models import (
    ParseResult,
    ReconciliationReport,
    StatementMetadata,
    Transaction,
)


def fake_parser(path: Path) -> ParseResult:
    marker = path.read_bytes().decode("latin-1")
    month = next(month for month in range(1, 13) if f"MONTH={month}" in marker)
    account = next(value for value in range(1, 13) if f"ACCOUNT={value}" in marker)
    account_type = "credit_card" if "TYPE=credit_card" in marker else "checking"
    amount_match = next((value for value in ("100.00", "-100.00", "-20.00") if f"AMOUNT={value}" in marker), None)
    amount = Decimal(amount_match or "-20.00")
    description = (
        "Mobile Banking payment to credit card"
        if "DESC=CARDPAYMENT" in marker
        else "Credit card payment received"
        if "DESC=PAYMENTRECEIVED" in marker
        else "LOCAL SAMPLE MERCHANT"
    )
    transaction = Transaction(
        transaction_id=f"sample-{account}-{month}",
        posted_at=date(2026, month, 10),
        description_raw=description,
        amount=amount,
        transaction_type="credit" if amount > 0 else "debit",
        source_statement_id=f"statement-{account}-{month}",
        page_number=1,
    )
    metadata = StatementMetadata(
        institution="sample_bank",
        account_type=account_type,
        period_start=date(2026, month, 1),
        period_end=date(2026, month, 28),
        source_statement_id=f"statement-{account}-{month}",
        page_count=1,
    )
    return ParseResult(
        metadata,
        [transaction],
        ReconciliationReport(status="unavailable"),
    )


def sample_files(months: tuple[int, ...] = (1, 2, 3)):
    return [
        (
            "files",
            (
                f"statement-{position}-{month}.pdf",
                f"%PDF-1.7 MONTH={month} ACCOUNT={position}".encode(),
                "application/pdf",
            ),
        )
        for position, month in enumerate(months, start=1)
    ]


def credit_card_files(months: tuple[int, ...] = (1, 2, 3)):
    return [
        (
            "files",
            (
                f"card-{position}-{month}.pdf",
                f"%PDF-1.7 MONTH={month} ACCOUNT={position} TYPE=credit_card".encode(),
                "application/pdf",
            ),
        )
        for position, month in enumerate(months, start=1)
    ]


def internal_transfer_files():
    return [
        (
            "files",
            (
                "checking-jan.pdf",
                b"%PDF-1.7 MONTH=1 ACCOUNT=1 AMOUNT=-100.00 DESC=CARDPAYMENT",
                "application/pdf",
            ),
        ),
        (
            "files",
            (
                "card-jan.pdf",
                b"%PDF-1.7 MONTH=1 ACCOUNT=2 AMOUNT=100.00 DESC=PAYMENTRECEIVED",
                "application/pdf",
            ),
        ),
        (
            "files",
            (
                "checking-feb.pdf",
                b"%PDF-1.7 MONTH=2 ACCOUNT=1",
                "application/pdf",
            ),
        ),
        (
            "files",
            (
                "checking-mar.pdf",
                b"%PDF-1.7 MONTH=3 ACCOUNT=1",
                "application/pdf",
            ),
        ),
    ]


class ApiConfigurationTests(unittest.TestCase):
    def test_cors_origins_can_be_configured_for_deployment(self) -> None:
        with patch.dict(
            "os.environ",
            {"FINSIM_CORS_ORIGINS": "https://finsim.example.com, https://staging.example.com/"},
        ):
            self.assertEqual(
                _cors_origins(),
                ["https://finsim.example.com", "https://staging.example.com"],
            )

    def test_cors_origins_default_to_local_development(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                _cors_origins(),
                ["http://localhost:5173", "http://127.0.0.1:5173"],
            )


class ProcessingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        db_path = Path(self.folder.name) / "finsim-test.db"
        self.account_service = AccountService(db_path)
        self.store = UserDataStore(db_path)
        self.service = ProcessingService(
            parse_statement_fn=fake_parser,
            data_store=self.store,
        )
        self.client_context = TestClient(
            create_app(
                self.service,
                account_service=self.account_service,
                data_store=self.store,
            )
        )
        self.client = self.client_context.__enter__()
        self.headers = self._account_headers("owner@example.com")

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.folder.cleanup()

    def _account_headers(self, email: str) -> dict[str, str]:
        signup = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Statement Owner",
                "email": email,
                "password": "securepass123",
            },
        ).json()
        self.client.post("/api/accounts/verify-email", json={"token": signup["verification_token"]})
        signin = self.client.post(
            "/api/accounts/signin",
            json={"email": email, "password": "securepass123"},
        ).json()
        return {"Authorization": f"Bearer {signin['session_token']}"}

    def test_health_check(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_job_runs_pipeline_and_waits_for_category_feedback(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            files=sample_files(),
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job_id = created.json()["job_id"]
        job = self.client.get(f"/api/processing-jobs/{job_id}", headers=self.headers).json()
        self.assertEqual(job["status"], "review")
        self.assertEqual(job["review_count"], 1)

        stored = self.service.get_job(job["job_id"])
        self.assertFalse(stored.workspace.exists())
        review = self.client.get(
            f"/api/processing-jobs/{job['job_id']}/review",
            headers=self.headers,
        )
        self.assertEqual(review.status_code, 200)
        self.assertEqual(len(review.json()["items"]), 1)
        self.assertEqual(review.json()["items"][0]["occurrence_count"], 3)
        self.assertEqual(len(review.json()["items"][0]["transaction_ids"]), 3)

    def test_feedback_completes_job_and_refreshes_results(self) -> None:
        job = self.client.post(
            "/api/processing-jobs",
            files=sample_files(),
            headers=self.headers,
        ).json()
        review = self.client.get(
            f"/api/processing-jobs/{job['job_id']}/review",
            headers=self.headers,
        ).json()
        decisions = [
            {
                "transaction_ids": item["transaction_ids"],
                "category": "Shopping",
                "remember_merchant": True,
            }
            for item in review["items"]
        ]
        updated = self.client.post(
            f"/api/processing-jobs/{job['job_id']}/feedback",
            json=decisions,
            headers=self.headers,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "complete")

        result = self.client.get(
            f"/api/processing-jobs/{job['job_id']}/result",
            headers=self.headers,
        )
        payload = result.json()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(payload["quality_report"]["review_rows"], 0)
        self.assertEqual(payload["quality_report"]["category_counts"], {"Shopping": 3})
        self.assertEqual(len(payload["feedback_audit"]), 3)
        self.assertEqual(payload["remembered_merchant_count"], 1)
        self.assertEqual(payload["reviewed_merchant_count"], 1)
        self.assertEqual(payload["analytics"]["forecast"]["target_month"], "2026-04")
        self.assertEqual(payload["analytics"]["monthly_summaries"][0]["month"], "2026-01")
        self.assertEqual(payload["analytics"]["monthly_summaries"][0]["spending"], "20.00")
        self.assertEqual(payload["analytics"]["category_breakdown"][0]["category"], "Shopping")

        batches = self.client.get(
            "/api/accounts/statement-batches",
            headers=self.headers,
        ).json()["items"]
        transactions = self.client.get(
            "/api/accounts/transactions",
            headers=self.headers,
        ).json()["items"]
        analytics = self.client.get(
            "/api/accounts/analytics",
            headers=self.headers,
        ).json()
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0]["transaction_count"], 3)
        self.assertEqual(len(transactions), 3)
        self.assertTrue(all(row["category"] == "Shopping" for row in transactions))
        self.assertEqual(analytics["source"], "saved-user-transactions")
        self.assertEqual(analytics["transaction_count"], 3)
        self.assertEqual(analytics["latest_batch"]["batch_id"], job["job_id"])
        self.assertEqual(analytics["analytics"]["forecast"]["target_month"], "2026-04")
        self.assertEqual(
            analytics["analytics"]["monthly_summaries"][0]["spending"],
            "20.00",
        )

    def test_feedback_must_cover_the_whole_merchant_group(self) -> None:
        job = self.client.post(
            "/api/processing-jobs",
            files=sample_files(),
            headers=self.headers,
        ).json()
        review = self.client.get(
            f"/api/processing-jobs/{job['job_id']}/review",
            headers=self.headers,
        ).json()
        item = review["items"][0]
        response = self.client.post(
            f"/api/processing-jobs/{job['job_id']}/feedback",
            json=[{
                "transaction_ids": [item["transaction_ids"][0]],
                "category": "Shopping",
                "remember_merchant": True,
            }],
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("every matching", response.json()["detail"])

    def test_upload_contract_rejects_too_few_and_duplicate_statements(self) -> None:
        too_few = self.client.post(
            "/api/processing-jobs",
            files=sample_files((1, 2)),
            headers=self.headers,
        )
        self.assertEqual(too_few.status_code, 400)
        self.assertIn("between 3 and 12", too_few.json()["detail"])

        duplicate = self.client.post(
            "/api/processing-jobs",
            files=[sample_files((1,))[0], sample_files((1,))[0], sample_files((2,))[0]],
            headers=self.headers,
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("duplicates", duplicate.json()["detail"])

    def test_upload_mode_rejects_bank_statements_in_credit_card_flow(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            data={"upload_mode": "credit"},
            files=sample_files(),
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(job["status"], "error")
        self.assertIn("credit card option", job["error"])

    def test_upload_mode_accepts_credit_card_statements(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            data={"upload_mode": "credit"},
            files=credit_card_files(),
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(job["status"], "review")

    def test_single_account_mode_rejects_mixed_account_types(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            data={"upload_mode": "single"},
            files=[
                *sample_files((1, 2)),
                credit_card_files((3,))[0],
            ],
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(job["status"], "error")
        self.assertIn("Single account uploads cannot mix", job["error"])

    def test_same_statement_content_is_rejected_even_when_pdf_bytes_differ(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            files=[
                (
                    "files",
                    ("statement-original.pdf", b"%PDF-1.7 MONTH=1 ACCOUNT=1 EXPORT=A", "application/pdf"),
                ),
                (
                    "files",
                    ("renamed-copy.pdf", b"%PDF-1.7 MONTH=1 ACCOUNT=1 EXPORT=B", "application/pdf"),
                ),
                (
                    "files",
                    ("statement-feb.pdf", b"%PDF-1.7 MONTH=2 ACCOUNT=1", "application/pdf"),
                ),
            ],
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(job["status"], "error")
        self.assertIn("same statement", job["error"])

    def test_multiple_accounts_can_cover_the_same_three_months(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            files=sample_files((1, 1, 2, 2, 3, 3)),
            headers=self.headers,
        )
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(created.status_code, 202)
        self.assertEqual(job["status"], "review")
        self.assertEqual(job["transaction_count"], 6)

    def test_same_month_cross_account_transfer_is_excluded_from_spending(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            files=internal_transfer_files(),
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 202)
        job_id = created.json()["job_id"]
        review = self.client.get(
            f"/api/processing-jobs/{job_id}/review",
            headers=self.headers,
        ).json()
        decisions = [
            {
                "transaction_ids": item["transaction_ids"],
                "category": "Shopping",
                "remember_merchant": False,
            }
            for item in review["items"]
        ]
        updated = self.client.post(
            f"/api/processing-jobs/{job_id}/feedback",
            json=decisions,
            headers=self.headers,
        )
        self.assertEqual(updated.status_code, 200)
        result = self.client.get(
            f"/api/processing-jobs/{job_id}/result",
            headers=self.headers,
        ).json()
        january = next(row for row in result["analytics"]["monthly_summaries"] if row["month"] == "2026-01")
        self.assertEqual(january["income"], "0.00")
        self.assertEqual(january["spending"], "0.00")
        self.assertEqual(result["quality_report"]["internal_transfer_matches"], 1)
        matched = [
            row for row in result["transactions"]
            if row["category_source"] == "internal_match"
        ]
        self.assertEqual(len(matched), 2)

    def test_month_gaps_are_allowed_but_non_pdf_content_is_rejected(self) -> None:
        gap = self.client.post(
            "/api/processing-jobs",
            files=sample_files((1, 2, 4)),
            headers=self.headers,
        )
        self.assertEqual(gap.status_code, 202)
        gap_job = self.client.get(
            f"/api/processing-jobs/{gap.json()['job_id']}",
            headers=self.headers,
        ).json()
        self.assertEqual(gap_job["status"], "review")
        self.assertEqual(gap_job["transaction_count"], 3)

        invalid = self.client.post(
            "/api/processing-jobs",
            files=[
                ("files", ("one.pdf", b"not a pdf", "application/pdf")),
                ("files", ("two.pdf", b"also not a pdf", "application/pdf")),
                ("files", ("three.pdf", b"still not a pdf", "application/pdf")),
            ],
            headers=self.headers,
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("PDF signature", invalid.json()["detail"])

    def test_job_can_be_deleted_and_unknown_job_returns_not_found(self) -> None:
        job = self.client.post(
            "/api/processing-jobs",
            files=sample_files(),
            headers=self.headers,
        ).json()
        deleted = self.client.delete(
            f"/api/processing-jobs/{job['job_id']}",
            headers=self.headers,
        )
        self.assertEqual(deleted.status_code, 204)
        missing = self.client.get(
            f"/api/processing-jobs/{job['job_id']}",
            headers=self.headers,
        )
        self.assertEqual(missing.status_code, 404)

    def test_processing_jobs_require_login_and_are_user_scoped(self) -> None:
        anonymous = self.client.post("/api/processing-jobs", files=sample_files())
        self.assertEqual(anonymous.status_code, 401)

        owner_job = self.client.post(
            "/api/processing-jobs",
            files=sample_files(),
            headers=self.headers,
        ).json()
        other_headers = self._account_headers("other@example.com")

        blocked = self.client.get(
            f"/api/processing-jobs/{owner_job['job_id']}",
            headers=other_headers,
        )
        self.assertEqual(blocked.status_code, 404)
        other_batches = self.client.get(
            "/api/accounts/statement-batches",
            headers=other_headers,
        ).json()["items"]
        other_analytics = self.client.get(
            "/api/accounts/analytics",
            headers=other_headers,
        ).json()
        self.assertEqual(other_batches, [])
        self.assertEqual(other_analytics["transaction_count"], 0)
        self.assertIsNone(other_analytics["latest_batch"])
        self.assertIn("No transactions", other_analytics["analytics"]["warnings"][0])


if __name__ == "__main__":
    unittest.main()
