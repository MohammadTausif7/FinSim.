"""Validate the extracted transaction CSV contract before transformation begins."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from .models import SourceTransaction


REQUIRED_FIELDS = {
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
}


class ContractError(ValueError):
    pass


def validate_headers(fieldnames: list[str] | None) -> None:
    available = set(fieldnames or [])
    missing = sorted(REQUIRED_FIELDS - available)
    if missing:
        raise ContractError("Input CSV is missing required columns: " + ", ".join(missing))


def parse_row(row: dict[str, str], row_number: int) -> SourceTransaction:
    label = f"CSV row {row_number}"
    try:
        posted_at = date.fromisoformat(row["posted_at"].strip())
    except ValueError as error:
        raise ContractError(f"{label} has an invalid posted_at date") from error

    try:
        amount = Decimal(row["amount"].strip())
        balance_value = row["balance"].strip()
        balance = Decimal(balance_value) if balance_value else None
        confidence = Decimal(row["extraction_confidence"].strip())
        page_number = int(row["page_number"].strip())
    except (InvalidOperation, ValueError) as error:
        raise ContractError(f"{label} contains an invalid number") from error

    transaction_id = row["transaction_id"].strip()
    description = " ".join(row["description_raw"].split())
    currency = row["currency"].strip().upper()
    if not transaction_id:
        raise ContractError(f"{label} is missing transaction_id")
    if not description:
        raise ContractError(f"{label} is missing description_raw")
    if len(currency) != 3 or not currency.isalpha():
        raise ContractError(f"{label} has an invalid currency code")
    if not Decimal("0.00") <= confidence <= Decimal("1.00"):
        raise ContractError(f"{label} has extraction_confidence outside 0 to 1")
    if page_number < 1:
        raise ContractError(f"{label} has an invalid page number")

    return SourceTransaction(
        transaction_id=transaction_id,
        posted_at=posted_at,
        description_raw=description,
        amount=amount,
        currency=currency,
        transaction_type=row["transaction_type"].strip().lower() or "unknown",
        balance=balance,
        category_raw=row["category_raw"].strip() or None,
        source_statement_id=row["source_statement_id"].strip(),
        page_number=page_number,
        extraction_method=row["extraction_method"].strip().lower(),
        extraction_confidence=confidence,
        pipeline_version=row["pipeline_version"].strip(),
    )
