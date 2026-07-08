"""Data contracts for cleaned transactions and quality reports."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class SourceTransaction:
    transaction_id: str
    posted_at: date
    description_raw: str
    amount: Decimal
    currency: str
    transaction_type: str
    balance: Decimal | None
    category_raw: str | None
    source_statement_id: str
    page_number: int
    extraction_method: str
    extraction_confidence: Decimal
    pipeline_version: str

    def identity_values(self) -> tuple[Any, ...]:
        """Values that must agree when the same id appears more than once."""

        return (
            self.posted_at,
            self.description_raw,
            self.amount,
            self.currency,
            self.transaction_type,
            self.balance,
            self.category_raw,
            self.source_statement_id,
            self.page_number,
            self.extraction_method,
            self.extraction_confidence,
            self.pipeline_version,
        )


@dataclass(frozen=True, slots=True)
class CategoryDecision:
    category: str
    source: str
    confidence: Decimal


@dataclass(frozen=True, slots=True)
class ProcessedTransaction:
    source: SourceTransaction
    merchant_clean: str
    category: str
    category_source: str
    category_confidence: Decimal
    needs_review: bool
    processing_version: str = "0.2.0"

    def as_csv_row(self) -> dict[str, str]:
        source = self.source
        return {
            "transaction_id": source.transaction_id,
            "posted_at": source.posted_at.isoformat(),
            "description_raw": source.description_raw,
            "merchant_clean": self.merchant_clean,
            "amount": format(source.amount, ".2f"),
            "currency": source.currency,
            "transaction_type": source.transaction_type,
            "balance": "" if source.balance is None else format(source.balance, ".2f"),
            "category_raw": source.category_raw or "",
            "category": self.category,
            "category_source": self.category_source,
            "category_confidence": format(self.category_confidence, ".2f"),
            "needs_review": "true" if self.needs_review else "false",
            "source_statement_id": source.source_statement_id,
            "page_number": str(source.page_number),
            "extraction_method": source.extraction_method,
            "extraction_confidence": format(source.extraction_confidence, ".2f"),
            "parser_version": source.pipeline_version,
            "processing_version": self.processing_version,
        }


@dataclass(slots=True)
class QualityReport:
    rulebook_version: str
    input_files: int = 0
    input_rows: int = 0
    output_rows: int = 0
    duplicates_removed: int = 0
    categorized_rows: int = 0
    review_rows: int = 0
    internal_transfer_matches: int = 0
    low_extraction_rows: int = 0
    zero_amount_rows: int = 0
    debit_total: Decimal = Decimal("0.00")
    credit_total: Decimal = Decimal("0.00")
    category_counts: dict[str, int] = field(default_factory=dict)
    category_spend: dict[str, Decimal] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["debit_total"] = format(self.debit_total, ".2f")
        result["credit_total"] = format(self.credit_total, ".2f")
        result["category_counts"] = dict(sorted(self.category_counts.items()))
        result["category_spend"] = {
            category: format(amount, ".2f")
            for category, amount in sorted(self.category_spend.items())
        }
        return result
