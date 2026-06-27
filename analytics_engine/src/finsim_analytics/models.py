"""Typed analytics contracts shared by the API and future dashboard work."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class ProcessedTransaction:
    transaction_id: str
    posted_at: date
    merchant_clean: str
    amount: Decimal
    currency: str
    transaction_type: str
    category: str
    category_confidence: Decimal
    needs_review: bool

    @property
    def month(self) -> str:
        return self.posted_at.strftime("%Y-%m")

    @property
    def spend_amount(self) -> Decimal:
        if self.amount >= 0:
            return Decimal("0.00")
        return -self.amount


@dataclass(frozen=True, slots=True)
class MonthlySummary:
    month: str
    income: Decimal
    spending: Decimal
    net_cash_flow: Decimal
    transaction_count: int
    review_count: int


@dataclass(frozen=True, slots=True)
class CategoryBreakdown:
    month: str
    category: str
    spending: Decimal
    transaction_count: int
    share_of_month: Decimal


@dataclass(frozen=True, slots=True)
class SpendingTrend:
    month: str
    category: str
    previous_spending: Decimal
    current_spending: Decimal
    change_amount: Decimal
    change_percent: Decimal | None
    direction: str


@dataclass(frozen=True, slots=True)
class AnomalyCandidate:
    transaction_id: str
    posted_at: str
    merchant: str
    category: str
    amount: Decimal
    reason: str
    severity: str


@dataclass(frozen=True, slots=True)
class ForecastRange:
    target_month: str
    expected_spending: Decimal
    low: Decimal
    high: Decimal
    method: str
    confidence: str


@dataclass(frozen=True, slots=True)
class AnalyticsReport:
    monthly_summaries: list[MonthlySummary] = field(default_factory=list)
    category_breakdown: list[CategoryBreakdown] = field(default_factory=list)
    spending_trends: list[SpendingTrend] = field(default_factory=list)
    anomaly_candidates: list[AnomalyCandidate] = field(default_factory=list)
    forecast: ForecastRange | None = None
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return _money_to_strings(asdict(self))


def _money_to_strings(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, ".2f")
    if isinstance(value, list):
        return [_money_to_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: _money_to_strings(item) for key, item in value.items()}
    return value
