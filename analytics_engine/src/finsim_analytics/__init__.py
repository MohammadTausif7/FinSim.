"""Public entry points for FinSim analytics."""

from .analyzer import build_report
from .csv_io import read_processed_transactions
from .models import (
    AnalyticsReport,
    AnomalyCandidate,
    CategoryBreakdown,
    ForecastRange,
    MonthlySummary,
    ProcessedTransaction,
    SpendingTrend,
)

__all__ = [
    "AnalyticsReport",
    "AnomalyCandidate",
    "CategoryBreakdown",
    "ForecastRange",
    "MonthlySummary",
    "ProcessedTransaction",
    "SpendingTrend",
    "build_report",
    "read_processed_transactions",
]
