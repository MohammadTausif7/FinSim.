"""Write normalized transactions using a stable downstream contract."""

from __future__ import annotations

import csv
from pathlib import Path

from .models import Transaction


CSV_FIELDS = [
    "transaction_id",
    "posted_at",
    "description_raw",
    "amount",
    "currency",
    "transaction_type",
    "balance",
    "category_raw",
    "source_statement_id",
    "page_number",
    "extraction_method",
    "extraction_confidence",
    "pipeline_version",
]


def write_transactions(path: Path, transactions: list[Transaction]) -> None:
    """Create parent folders and replace the output only after writing succeeds."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    with temporary_path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(transaction.as_csv_row() for transaction in transactions)
    temporary_path.replace(path)
