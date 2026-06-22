"""Data contracts shared by statement adapters and downstream consumers."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Literal


TransactionKind = Literal[
    "debit",
    "credit",
    "payment",
    "refund",
    "transfer",
    "fee",
    "interest",
    "unknown",
]


@dataclass(slots=True)
class Transaction:
    """One normalized transaction without customer or account identifiers."""

    transaction_id: str
    posted_at: date
    description_raw: str
    amount: Decimal
    currency: str = "USD"
    transaction_type: TransactionKind = "unknown"
    balance: Decimal | None = None
    category_raw: str | None = None
    source_statement_id: str = ""
    page_number: int = 0
    extraction_method: str = "text"
    extraction_confidence: Decimal = Decimal("1.00")
    pipeline_version: str = "0.1.0"

    def as_csv_row(self) -> dict[str, str]:
        """Return stable string values so CSV never converts money to float."""

        return {
            "transaction_id": self.transaction_id,
            "posted_at": self.posted_at.isoformat(),
            "description_raw": self.description_raw,
            "amount": format(self.amount, ".2f"),
            "currency": self.currency,
            "transaction_type": self.transaction_type,
            "balance": "" if self.balance is None else format(self.balance, ".2f"),
            "category_raw": self.category_raw or "",
            "source_statement_id": self.source_statement_id,
            "page_number": str(self.page_number),
            "extraction_method": self.extraction_method,
            "extraction_confidence": format(self.extraction_confidence, ".2f"),
            "pipeline_version": self.pipeline_version,
        }


@dataclass(slots=True)
class StatementMetadata:
    """Nonidentifying statement information needed for validation."""

    institution: str
    account_type: str
    period_start: date | None = None
    period_end: date | None = None
    beginning_balance: Decimal | None = None
    ending_balance: Decimal | None = None
    source_statement_id: str = ""
    extraction_method: str = "text"
    page_count: int = 0


@dataclass(slots=True)
class ReconciliationReport:
    """Evidence that extracted amounts agree with available balances."""

    status: Literal["passed", "warning", "unavailable"]
    expected_ending_balance: Decimal | None = None
    calculated_ending_balance: Decimal | None = None
    difference: Decimal | None = None
    checked_running_balances: int = 0
    running_balance_errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        result = asdict(self)
        for key in ("expected_ending_balance", "calculated_ending_balance", "difference"):
            value = result[key]
            result[key] = None if value is None else format(value, ".2f")
        return result


@dataclass(slots=True)
class ParseResult:
    """Complete output from one statement parsing job."""

    metadata: StatementMetadata
    transactions: list[Transaction]
    reconciliation: ReconciliationReport
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        metadata = asdict(self.metadata)
        for key in ("period_start", "period_end"):
            value = metadata[key]
            metadata[key] = None if value is None else value.isoformat()
        for key in ("beginning_balance", "ending_balance"):
            value = metadata[key]
            metadata[key] = None if value is None else format(value, ".2f")
        return {
            "metadata": metadata,
            "transaction_count": len(self.transactions),
            "reconciliation": self.reconciliation.as_dict(),
            "warnings": self.warnings,
        }
