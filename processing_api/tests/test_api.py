from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from finsim_api.app import create_app
from finsim_api.service import ProcessingService
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
    transaction = Transaction(
        transaction_id=f"sample-{account}-{month}",
        posted_at=date(2026, month, 10),
        description_raw="LOCAL SAMPLE MERCHANT",
        amount=Decimal("-20.00"),
        transaction_type="debit",
        source_statement_id=f"statement-{account}-{month}",
        page_number=1,
    )
    metadata = StatementMetadata(
        institution="sample_bank",
        account_type="checking",
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


class ProcessingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ProcessingService(parse_statement_fn=fake_parser)
        self.client_context = TestClient(create_app(self.service))
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)

    def test_health_check(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_job_runs_pipeline_and_waits_for_category_feedback(self) -> None:
        created = self.client.post("/api/processing-jobs", files=sample_files())
        self.assertEqual(created.status_code, 202)
        job_id = created.json()["job_id"]
        job = self.client.get(f"/api/processing-jobs/{job_id}").json()
        self.assertEqual(job["status"], "review")
        self.assertEqual(job["review_count"], 1)

        stored = self.service.get_job(job["job_id"])
        self.assertFalse(stored.workspace.exists())
        review = self.client.get(f"/api/processing-jobs/{job['job_id']}/review")
        self.assertEqual(review.status_code, 200)
        self.assertEqual(len(review.json()["items"]), 1)
        self.assertEqual(review.json()["items"][0]["occurrence_count"], 3)
        self.assertEqual(len(review.json()["items"][0]["transaction_ids"]), 3)

    def test_feedback_completes_job_and_refreshes_results(self) -> None:
        job = self.client.post("/api/processing-jobs", files=sample_files()).json()
        review = self.client.get(f"/api/processing-jobs/{job['job_id']}/review").json()
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
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "complete")

        result = self.client.get(f"/api/processing-jobs/{job['job_id']}/result")
        payload = result.json()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(payload["quality_report"]["review_rows"], 0)
        self.assertEqual(payload["quality_report"]["category_counts"], {"Shopping": 3})
        self.assertEqual(len(payload["feedback_audit"]), 3)
        self.assertEqual(payload["remembered_merchant_count"], 1)
        self.assertEqual(payload["reviewed_merchant_count"], 1)

    def test_feedback_must_cover_the_whole_merchant_group(self) -> None:
        job = self.client.post("/api/processing-jobs", files=sample_files()).json()
        review = self.client.get(f"/api/processing-jobs/{job['job_id']}/review").json()
        item = review["items"][0]
        response = self.client.post(
            f"/api/processing-jobs/{job['job_id']}/feedback",
            json=[{
                "transaction_ids": [item["transaction_ids"][0]],
                "category": "Shopping",
                "remember_merchant": True,
            }],
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("every matching", response.json()["detail"])

    def test_upload_contract_rejects_too_few_and_duplicate_statements(self) -> None:
        too_few = self.client.post("/api/processing-jobs", files=sample_files((1, 2)))
        self.assertEqual(too_few.status_code, 400)
        self.assertIn("between 3 and 12", too_few.json()["detail"])

        duplicate = self.client.post(
            "/api/processing-jobs",
            files=[sample_files((1,))[0], sample_files((1,))[0], sample_files((2,))[0]],
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("duplicates", duplicate.json()["detail"])

    def test_multiple_accounts_can_cover_the_same_three_months(self) -> None:
        created = self.client.post(
            "/api/processing-jobs",
            files=sample_files((1, 1, 2, 2, 3, 3)),
        )
        job = self.client.get(
            f"/api/processing-jobs/{created.json()['job_id']}"
        ).json()
        self.assertEqual(created.status_code, 202)
        self.assertEqual(job["status"], "review")
        self.assertEqual(job["transaction_count"], 6)

    def test_month_gaps_and_non_pdf_content_are_rejected(self) -> None:
        gap = self.client.post("/api/processing-jobs", files=sample_files((1, 2, 4)))
        self.assertEqual(gap.status_code, 202)
        gap_job = self.client.get(
            f"/api/processing-jobs/{gap.json()['job_id']}"
        ).json()
        self.assertEqual(gap_job["status"], "error")
        self.assertIn("consecutive", gap_job["error"])

        invalid = self.client.post(
            "/api/processing-jobs",
            files=[
                ("files", ("one.pdf", b"not a pdf", "application/pdf")),
                ("files", ("two.pdf", b"also not a pdf", "application/pdf")),
                ("files", ("three.pdf", b"still not a pdf", "application/pdf")),
            ],
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("PDF signature", invalid.json()["detail"])

    def test_job_can_be_deleted_and_unknown_job_returns_not_found(self) -> None:
        job = self.client.post("/api/processing-jobs", files=sample_files()).json()
        deleted = self.client.delete(f"/api/processing-jobs/{job['job_id']}")
        self.assertEqual(deleted.status_code, 204)
        missing = self.client.get(f"/api/processing-jobs/{job['job_id']}")
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
