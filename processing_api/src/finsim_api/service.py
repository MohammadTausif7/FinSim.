"""Coordinate temporary uploads, parsing, categorization, and user review."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import BinaryIO, Callable, Literal, Sequence
from uuid import uuid4

from finsim_parser import ParseResult, parse_statement
from finsim_parser.csv_writer import write_transactions
from finsim_transactions import apply_feedback, process_files
from finsim_transactions.cleaning import normalize_description
from finsim_transactions.feedback import FeedbackAuditRecord, FeedbackError, parse_feedback_payload
from finsim_transactions.models import ProcessedTransaction, QualityReport
from finsim_transactions.rules import available_categories, load_rulebook


MINIMUM_STATEMENTS = 3
MAXIMUM_STATEMENTS = 12
MAXIMUM_FILE_BYTES = 25 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024

JobStatus = Literal["processing", "review", "complete", "error"]


class JobNotFoundError(LookupError):
    pass


class JobStateError(RuntimeError):
    pass


@dataclass(slots=True)
class UploadSource:
    filename: str
    content_type: str | None
    stream: BinaryIO


@dataclass(slots=True)
class JobRecord:
    job_id: str
    filenames: list[str]
    workspace: Path
    statement_paths: list[Path]
    status: JobStatus = "processing"
    stage: str = "validate"
    progress: int = 14
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    transactions: list[ProcessedTransaction] = field(default_factory=list)
    report: QualityReport | None = None
    parse_summaries: list[dict[str, object]] = field(default_factory=list)
    audit_records: list[FeedbackAuditRecord] = field(default_factory=list)
    merchant_rules: dict[str, str] = field(default_factory=dict)
    feedback_group_count: int = 0
    error: str | None = None


class ProcessingService:
    """In-memory job registry with short-lived private file workspaces."""

    def __init__(
        self,
        *,
        parse_statement_fn: Callable[[Path], ParseResult] = parse_statement,
        process_files_fn: Callable[..., tuple[list[ProcessedTransaction], QualityReport]] = process_files,
    ) -> None:
        self._parse_statement = parse_statement_fn
        self._process_files = process_files_fn
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.RLock()

    def create_job(self, uploads: Sequence[UploadSource]) -> JobRecord:
        if not MINIMUM_STATEMENTS <= len(uploads) <= MAXIMUM_STATEMENTS:
            raise ValueError(
                f"Upload between {MINIMUM_STATEMENTS} and {MAXIMUM_STATEMENTS} statements"
            )

        job_id = uuid4().hex
        workspace = Path(tempfile.mkdtemp(prefix=f"finsim-{job_id[:8]}-"))
        statement_paths: list[Path] = []
        filenames: list[str] = []
        hashes: set[str] = set()
        try:
            for position, upload in enumerate(uploads, start=1):
                filename = Path(upload.filename or "").name
                if not filename.lower().endswith(".pdf"):
                    raise ValueError(f"{filename or 'Uploaded file'} must be a PDF")
                if upload.content_type not in {"application/pdf", "application/octet-stream", None}:
                    raise ValueError(f"{filename} has an unsupported content type")

                destination = workspace / f"statement-{position:02d}.pdf"
                digest, size, signature = self._copy_upload(upload.stream, destination)
                if size == 0:
                    raise ValueError(f"{filename} is empty")
                if signature != b"%PDF-":
                    raise ValueError(f"{filename} does not contain a PDF signature")
                if digest in hashes:
                    raise ValueError(f"{filename} duplicates another uploaded statement")
                hashes.add(digest)
                statement_paths.append(destination)
                filenames.append(filename)
        except Exception:
            shutil.rmtree(workspace, ignore_errors=True)
            raise

        job = JobRecord(job_id, filenames, workspace, statement_paths)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def process_job(self, job_id: str) -> None:
        job = self.get_job(job_id)
        try:
            self._set_progress(job, "extract", 42)
            parse_results = [self._parse_statement(path) for path in job.statement_paths]
            job.parse_summaries = [result.summary() for result in parse_results]

            self._set_progress(job, "periods", 58)
            self._validate_months(parse_results)

            self._set_progress(job, "clean", 74)
            csv_paths: list[Path] = []
            for position, result in enumerate(parse_results, start=1):
                csv_path = job.workspace / f"transactions-{position:02d}.csv"
                write_transactions(csv_path, result.transactions)
                csv_paths.append(csv_path)

            self._set_progress(job, "categorize", 90)
            transactions, report = self._process_files(
                csv_paths,
                merchant_rules=job.merchant_rules,
            )
            with self._lock:
                job.transactions = transactions
                job.report = report
                job.status = "review" if self._category_review_rows(job) else "complete"
                job.progress = 92 if job.status == "review" else 100
        except (FileNotFoundError, OSError, RuntimeError, ValueError) as error:
            with self._lock:
                job.status = "error"
                job.error = str(error)
        except Exception:
            with self._lock:
                job.status = "error"
                job.error = "An unexpected processing error occurred"
        finally:
            self._remove_workspace(job)

    def apply_job_feedback(self, job_id: str, payload: object) -> JobRecord:
        job = self.get_job(job_id)
        if job.status != "review" or job.report is None:
            raise JobStateError("This job is not waiting for category feedback")
        decisions, group_count = self._parse_group_feedback(job, payload)
        result = apply_feedback(
            job.transactions,
            decisions,
            existing_merchant_rules=job.merchant_rules,
            quality_report=job.report,
        )
        with self._lock:
            job.transactions = result.transactions
            job.report = result.quality_report
            job.merchant_rules = result.merchant_rules
            job.audit_records.extend(result.audit_records)
            job.feedback_group_count += group_count
            job.status = "review" if self._category_review_rows(job) else "complete"
            job.progress = 92 if job.status == "review" else 100
        return job

    def get_job(self, job_id: str) -> JobRecord:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(f"Processing job {job_id!r} was not found")
        return job

    def delete_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.pop(job_id, None)
        if job is None:
            raise JobNotFoundError(f"Processing job {job_id!r} was not found")
        self._remove_workspace(job)

    def clear(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
            self._jobs.clear()
        for job in jobs:
            self._remove_workspace(job)

    def job_view(self, job: JobRecord) -> dict[str, object]:
        return {
            "job_id": job.job_id,
            "status": job.status,
            "stage": job.stage,
            "progress": job.progress,
            "filenames": job.filenames,
            "review_count": len(self._category_review_groups(job)),
            "transaction_count": len(job.transactions),
            "error": job.error,
        }

    def review_view(self, job: JobRecord) -> dict[str, object]:
        categories = sorted(available_categories(load_rulebook()))
        common_choices = ["Shopping", "Dining", "Services"]
        items = []
        for rows in self._category_review_groups(job):
            row = rows[0]
            items.append(
                {
                    "id": row.source.transaction_id,
                    "transaction_ids": [item.source.transaction_id for item in rows],
                    "occurrence_count": len(rows),
                    "merchant": row.merchant_clean,
                    "description": row.source.description_raw,
                    "posted_at": min(item.source.posted_at for item in rows).isoformat(),
                    "amount": format(sum(abs(item.source.amount) for item in rows), ".2f"),
                    "confidence": int(min(item.category_confidence for item in rows) * 100),
                    "suggestions": common_choices,
                }
            )
        return {"job_id": job.job_id, "items": items, "categories": categories}

    def result_view(self, job: JobRecord) -> dict[str, object]:
        if job.status != "complete" or job.report is None:
            raise JobStateError("Processing results are available only after review is complete")
        return {
            "job_id": job.job_id,
            "status": job.status,
            "transactions": [row.as_csv_row() for row in job.transactions],
            "quality_report": job.report.as_dict(),
            "statement_summaries": job.parse_summaries,
            "feedback_audit": [record.as_dict() for record in job.audit_records],
            "remembered_merchant_count": len(job.merchant_rules),
            "reviewed_merchant_count": job.feedback_group_count,
        }

    @staticmethod
    def _copy_upload(source: BinaryIO, destination: Path) -> tuple[str, int, bytes]:
        digest = hashlib.sha256()
        size = 0
        signature = b""
        with destination.open("wb") as output:
            while True:
                chunk = source.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                if not signature:
                    signature = chunk[:5]
                size += len(chunk)
                if size > MAXIMUM_FILE_BYTES:
                    raise ValueError("Each statement must be 25 MB or smaller")
                digest.update(chunk)
                output.write(chunk)
        return digest.hexdigest(), size, signature

    @staticmethod
    def _validate_months(results: Sequence[ParseResult]) -> None:
        periods = []
        for result in results:
            period_date = result.metadata.period_end or result.metadata.period_start
            if period_date is None:
                raise ValueError("A statement period could not be confirmed")
            periods.append(period_date.year * 12 + period_date.month)
        ordered = sorted(set(periods))
        if len(ordered) < MINIMUM_STATEMENTS:
            raise ValueError("Statements must cover at least three distinct monthly periods")
        if any(current - previous != 1 for previous, current in zip(ordered, ordered[1:])):
            raise ValueError("Statements must cover consecutive monthly periods")

    @staticmethod
    def _category_review_rows(job: JobRecord) -> list[ProcessedTransaction]:
        return [
            row
            for row in job.transactions
            if row.category == "Other" or row.category_confidence < Decimal("0.70")
        ]

    @classmethod
    def _category_review_groups(cls, job: JobRecord) -> list[list[ProcessedTransaction]]:
        groups: dict[str, list[ProcessedTransaction]] = {}
        for row in cls._category_review_rows(job):
            merchant_key = normalize_description(row.merchant_clean)
            if merchant_key == "UNKNOWN MERCHANT":
                merchant_key = f"{merchant_key}|{normalize_description(row.source.description_raw)}"
            groups.setdefault(merchant_key, []).append(row)
        return list(groups.values())

    @classmethod
    def _parse_group_feedback(
        cls,
        job: JobRecord,
        payload: object,
    ) -> tuple[list, int]:
        if not isinstance(payload, list) or not payload:
            raise FeedbackError("Feedback must contain at least one merchant decision")
        available_groups = {
            frozenset(row.source.transaction_id for row in rows)
            for rows in cls._category_review_groups(job)
        }
        expanded: list[dict[str, object]] = []
        for position, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                raise FeedbackError(f"Merchant decision {position} must be an object")
            transaction_ids = item.get("transaction_ids")
            if not isinstance(transaction_ids, list) or not transaction_ids:
                raise FeedbackError(f"Merchant decision {position} requires transaction_ids")
            if not all(isinstance(value, str) and value.strip() for value in transaction_ids):
                raise FeedbackError(f"Merchant decision {position} has an invalid transaction id")
            selected_ids = frozenset(value.strip() for value in transaction_ids)
            if selected_ids not in available_groups:
                raise FeedbackError(
                    f"Merchant decision {position} must include every matching review transaction"
                )
            for transaction_id in selected_ids:
                expanded.append(
                    {
                        "transaction_id": transaction_id,
                        "category": item.get("category"),
                        "remember_merchant": item.get("remember_merchant", False),
                    }
                )
        return parse_feedback_payload(expanded), len(payload)

    def _set_progress(self, job: JobRecord, stage: str, progress: int) -> None:
        with self._lock:
            job.stage = stage
            job.progress = progress

    @staticmethod
    def _remove_workspace(job: JobRecord) -> None:
        shutil.rmtree(job.workspace, ignore_errors=True)
