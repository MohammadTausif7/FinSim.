"""Small parsing helpers used by more than one bank adapter."""

from __future__ import annotations

import hashlib
import re
from datetime import date
from decimal import Decimal, InvalidOperation


MONEY_PATTERN = re.compile(r"(?<!\w)([+-]?\$?\(?\d[\d,]*\.\d{2}\)?)(?!\w)")
SPACE_PATTERN = re.compile(r"\s+")


def clean_space(value: str) -> str:
    return SPACE_PATTERN.sub(" ", value).strip()


def money(value: str) -> Decimal:
    """Parse statement money without passing through binary floating point."""

    cleaned = value.strip().replace("$", "").replace(",", "")
    negative_parentheses = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation as error:
        raise ValueError(f"Invalid money value: {value!r}") from error
    return -amount if negative_parentheses else amount


def infer_date(month: int, day: int, period_end: date) -> date:
    """Infer the year for statement periods that cross New Year."""

    year = period_end.year - 1 if month > period_end.month else period_end.year
    return date(year, month, day)


def stable_transaction_id(
    source_statement_id: str,
    posted_at: date,
    description: str,
    amount: Decimal,
    ordinal: int,
) -> str:
    material = "|".join(
        [source_statement_id, posted_at.isoformat(), clean_space(description).upper(), str(amount), str(ordinal)]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]


def source_id_from_bytes(content: bytes) -> str:
    """Create a pseudonymous id without storing a filename or account number."""

    return hashlib.sha256(content).hexdigest()[:20]
