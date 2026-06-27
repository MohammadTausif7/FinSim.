"""Read the cleaned transaction CSV produced by the transaction processing work."""

from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .models import ProcessedTransaction


REQUIRED_COLUMNS = {
    "transaction_id",
    "posted_at",
    "merchant_clean",
    "amount",
    "currency",
    "transaction_type",
    "category",
    "category_confidence",
    "needs_review",
}


class AnalyticsInputError(ValueError):
    """Raised when the analytics input does not match the processed CSV contract."""


def read_processed_transactions(path: Path) -> list[ProcessedTransaction]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            names = ", ".join(sorted(missing))
            raise AnalyticsInputError(f"Processed CSV is missing required columns: {names}")
        return [_row_to_transaction(row, position) for position, row in enumerate(reader, start=2)]


def _row_to_transaction(row: dict[str, str], line_number: int) -> ProcessedTransaction:
    try:
        posted_at = date.fromisoformat(row["posted_at"])
        amount = Decimal(row["amount"])
        confidence = Decimal(row["category_confidence"])
    except (InvalidOperation, ValueError) as error:
        raise AnalyticsInputError(f"Invalid value on line {line_number}") from error

    transaction_id = row["transaction_id"].strip()
    if not transaction_id:
        raise AnalyticsInputError(f"Missing transaction id on line {line_number}")

    merchant = row["merchant_clean"].strip() or "Unknown merchant"
    category = row["category"].strip() or "Other"
    currency = row["currency"].strip() or "USD"
    transaction_type = row["transaction_type"].strip() or "unknown"
    needs_review = row["needs_review"].strip().lower() == "true"

    return ProcessedTransaction(
        transaction_id=transaction_id,
        posted_at=posted_at,
        merchant_clean=merchant,
        amount=amount,
        currency=currency,
        transaction_type=transaction_type,
        category=category,
        category_confidence=confidence,
        needs_review=needs_review,
    )
