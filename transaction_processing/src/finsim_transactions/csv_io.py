"""Read extracted transaction CSV files and write the stable processing contract."""

from __future__ import annotations

import csv
from pathlib import Path

from .contracts import parse_row, validate_headers
from .models import ProcessedTransaction, SourceTransaction


OUTPUT_FIELDS = [
    "transaction_id",
    "posted_at",
    "description_raw",
    "merchant_clean",
    "amount",
    "currency",
    "transaction_type",
    "balance",
    "category_raw",
    "category",
    "category_source",
    "category_confidence",
    "needs_review",
    "source_statement_id",
    "page_number",
    "extraction_method",
    "extraction_confidence",
    "parser_version",
    "processing_version",
]


def read_transactions(path: Path) -> list[SourceTransaction]:
    if path.suffix.lower() != ".csv":
        raise ValueError(f"Input must be a CSV file: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"Input CSV not found: {path}")
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        validate_headers(reader.fieldnames)
        return [parse_row(row, row_number) for row_number, row in enumerate(reader, start=2)]


def write_processed(path: Path, transactions: list[ProcessedTransaction]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(transaction.as_csv_row() for transaction in transactions)
    temporary.replace(path)
