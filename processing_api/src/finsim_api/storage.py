"""SQLite storage for user-owned statement processing results."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from .accounts import DEFAULT_DB_PATH


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class UserDataStore:
    """Persist completed processing jobs without exposing the raw PDF files."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def merchant_rules_for_user(self, user_id: str) -> dict[str, str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT merchant_key, category
                FROM user_merchant_rules
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchall()
        return {row["merchant_key"]: row["category"] for row in rows}

    def save_merchant_rules(self, user_id: str, rules: Mapping[str, str]) -> None:
        if not rules:
            return
        saved_at = _now()
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO user_merchant_rules (user_id, merchant_key, category, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, merchant_key)
                DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at
                """,
                [
                    (user_id, merchant_key, category, saved_at)
                    for merchant_key, category in sorted(rules.items())
                ],
            )

    def save_completed_job(self, job: Any) -> None:
        if job.user_id is None or job.report is None:
            return

        saved_at = _now()
        quality_report = job.report.as_dict()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO statement_batches (
                    batch_id, user_id, status, statement_count, transaction_count,
                    review_count, filenames_json, statement_summaries_json,
                    quality_report_json, created_at, completed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(batch_id)
                DO UPDATE SET
                    status = excluded.status,
                    transaction_count = excluded.transaction_count,
                    review_count = excluded.review_count,
                    statement_summaries_json = excluded.statement_summaries_json,
                    quality_report_json = excluded.quality_report_json,
                    completed_at = excluded.completed_at
                """,
                (
                    job.job_id,
                    job.user_id,
                    job.status,
                    len(job.filenames),
                    len(job.transactions),
                    job.feedback_group_count,
                    json.dumps(job.filenames),
                    json.dumps(job.parse_summaries),
                    json.dumps(quality_report),
                    job.created_at.isoformat(),
                    saved_at,
                ),
            )
            connection.execute(
                "DELETE FROM user_transactions WHERE batch_id = ?",
                (job.job_id,),
            )
            connection.executemany(
                """
                INSERT INTO user_transactions (
                    batch_id, user_id, transaction_id, posted_at, description_raw,
                    merchant_clean, amount, currency, transaction_type, category,
                    category_source, category_confidence, needs_review,
                    source_statement_id, saved_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [self._transaction_row(job, transaction, saved_at) for transaction in job.transactions],
            )
        self.save_merchant_rules(job.user_id, job.merchant_rules)

    def statement_batches_for_user(self, user_id: str) -> list[dict[str, object]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM statement_batches
                WHERE user_id = ?
                ORDER BY completed_at DESC, created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [self._batch_dict(row) for row in rows]

    def transactions_for_user(self, user_id: str, limit: int = 500) -> list[dict[str, object]]:
        safe_limit = min(max(limit, 1), 2_000)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM user_transactions
                WHERE user_id = ?
                ORDER BY posted_at DESC, transaction_id DESC
                LIMIT ?
                """,
                (user_id, safe_limit),
            ).fetchall()
        return [self._transaction_dict(row) for row in rows]

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS statement_batches (
                    batch_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    statement_count INTEGER NOT NULL,
                    transaction_count INTEGER NOT NULL,
                    review_count INTEGER NOT NULL,
                    filenames_json TEXT NOT NULL,
                    statement_summaries_json TEXT NOT NULL,
                    quality_report_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_transactions (
                    batch_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    transaction_id TEXT NOT NULL,
                    posted_at TEXT NOT NULL,
                    description_raw TEXT NOT NULL,
                    merchant_clean TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    currency TEXT NOT NULL,
                    transaction_type TEXT NOT NULL,
                    category TEXT NOT NULL,
                    category_source TEXT NOT NULL,
                    category_confidence TEXT NOT NULL,
                    needs_review INTEGER NOT NULL,
                    source_statement_id TEXT NOT NULL,
                    saved_at TEXT NOT NULL,
                    PRIMARY KEY (batch_id, transaction_id)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_merchant_rules (
                    user_id TEXT NOT NULL,
                    merchant_key TEXT NOT NULL,
                    category TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, merchant_key)
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_transactions_user_date
                ON user_transactions (user_id, posted_at)
                """
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def _transaction_row(job: Any, transaction: Any, saved_at: str) -> tuple[object, ...]:
        source = transaction.source
        return (
            job.job_id,
            job.user_id,
            source.transaction_id,
            source.posted_at.isoformat(),
            source.description_raw,
            transaction.merchant_clean,
            format(source.amount, ".2f"),
            source.currency,
            source.transaction_type,
            transaction.category,
            transaction.category_source,
            format(transaction.category_confidence, ".2f"),
            1 if transaction.needs_review else 0,
            source.source_statement_id,
            saved_at,
        )

    @staticmethod
    def _batch_dict(row: sqlite3.Row) -> dict[str, object]:
        return {
            "batch_id": row["batch_id"],
            "status": row["status"],
            "statement_count": row["statement_count"],
            "transaction_count": row["transaction_count"],
            "review_count": row["review_count"],
            "filenames": json.loads(row["filenames_json"]),
            "statement_summaries": json.loads(row["statement_summaries_json"]),
            "quality_report": json.loads(row["quality_report_json"]),
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }

    @staticmethod
    def _transaction_dict(row: sqlite3.Row) -> dict[str, object]:
        return {
            "batch_id": row["batch_id"],
            "transaction_id": row["transaction_id"],
            "posted_at": row["posted_at"],
            "description_raw": row["description_raw"],
            "merchant_clean": row["merchant_clean"],
            "amount": row["amount"],
            "currency": row["currency"],
            "transaction_type": row["transaction_type"],
            "category": row["category"],
            "category_source": row["category_source"],
            "category_confidence": row["category_confidence"],
            "needs_review": bool(row["needs_review"]),
            "source_statement_id": row["source_statement_id"],
            "saved_at": row["saved_at"],
        }
