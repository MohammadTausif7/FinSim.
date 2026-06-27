"""Build dashboard-ready analytics from cleaned transactions."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from .models import (
    AnalyticsReport,
    AnomalyCandidate,
    CategoryBreakdown,
    ForecastRange,
    MonthlySummary,
    ProcessedTransaction,
    SpendingTrend,
)


MONEY = Decimal("0.01")
PERCENT = Decimal("0.01")


def build_report(transactions: list[ProcessedTransaction]) -> AnalyticsReport:
    ordered = sorted(transactions, key=lambda row: (row.posted_at, row.transaction_id))
    if not ordered:
        return AnalyticsReport(warnings=["No transactions were provided for analytics."])

    warnings: list[str] = []
    if len({row.month for row in ordered}) < 3:
        warnings.append("Forecast quality improves when at least three months are available.")
    if any(row.needs_review for row in ordered):
        warnings.append("Some transactions still need review before final analytics.")

    monthly = _monthly_summaries(ordered)
    breakdown = _category_breakdown(ordered, monthly)
    trends = _spending_trends(breakdown)
    anomalies = _anomaly_candidates(ordered)
    forecast = _forecast_next_month(monthly)

    return AnalyticsReport(
        monthly_summaries=monthly,
        category_breakdown=breakdown,
        spending_trends=trends,
        anomaly_candidates=anomalies,
        forecast=forecast,
        warnings=warnings,
    )


def _monthly_summaries(transactions: list[ProcessedTransaction]) -> list[MonthlySummary]:
    buckets: dict[str, list[ProcessedTransaction]] = defaultdict(list)
    for row in transactions:
        buckets[row.month].append(row)

    summaries: list[MonthlySummary] = []
    for month in sorted(buckets):
        rows = buckets[month]
        income = sum((row.amount for row in rows if row.amount > 0), Decimal("0.00"))
        spending = sum((row.spend_amount for row in rows), Decimal("0.00"))
        net = income - spending
        summaries.append(
            MonthlySummary(
                month=month,
                income=_money(income),
                spending=_money(spending),
                net_cash_flow=_money(net),
                transaction_count=len(rows),
                review_count=sum(row.needs_review for row in rows),
            )
        )
    return summaries


def _category_breakdown(
    transactions: list[ProcessedTransaction],
    monthly: list[MonthlySummary],
) -> list[CategoryBreakdown]:
    monthly_spend = {row.month: row.spending for row in monthly}
    buckets: dict[tuple[str, str], list[ProcessedTransaction]] = defaultdict(list)
    for row in transactions:
        if row.amount < 0:
            buckets[(row.month, row.category)].append(row)

    breakdown: list[CategoryBreakdown] = []
    for month, category in sorted(buckets):
        rows = buckets[(month, category)]
        spending = _money(sum((row.spend_amount for row in rows), Decimal("0.00")))
        total = monthly_spend.get(month, Decimal("0.00"))
        share = Decimal("0.00") if total == 0 else (spending / total * Decimal("100")).quantize(PERCENT)
        breakdown.append(
            CategoryBreakdown(
                month=month,
                category=category,
                spending=spending,
                transaction_count=len(rows),
                share_of_month=share,
            )
        )
    return breakdown


def _spending_trends(breakdown: list[CategoryBreakdown]) -> list[SpendingTrend]:
    by_category: dict[str, list[CategoryBreakdown]] = defaultdict(list)
    for row in breakdown:
        by_category[row.category].append(row)

    trends: list[SpendingTrend] = []
    for category, rows in by_category.items():
        rows.sort(key=lambda row: row.month)
        for previous, current in zip(rows, rows[1:]):
            change = _money(current.spending - previous.spending)
            percent = None if previous.spending == 0 else (change / previous.spending * Decimal("100")).quantize(PERCENT)
            direction = "flat"
            if change > Decimal("5.00"):
                direction = "up"
            elif change < Decimal("-5.00"):
                direction = "down"
            trends.append(
                SpendingTrend(
                    month=current.month,
                    category=category,
                    previous_spending=previous.spending,
                    current_spending=current.spending,
                    change_amount=change,
                    change_percent=percent,
                    direction=direction,
                )
            )
    return sorted(trends, key=lambda row: (row.month, row.category))


def _anomaly_candidates(transactions: list[ProcessedTransaction]) -> list[AnomalyCandidate]:
    debit_rows = [row for row in transactions if row.amount < 0]
    by_category: dict[str, list[ProcessedTransaction]] = defaultdict(list)
    for row in debit_rows:
        by_category[row.category].append(row)

    candidates: list[AnomalyCandidate] = []
    for row in debit_rows:
        peers = by_category[row.category]
        average = sum((peer.spend_amount for peer in peers), Decimal("0.00")) / Decimal(len(peers))
        high_single_charge = row.spend_amount >= Decimal("250.00")
        high_vs_category = len(peers) >= 3 and row.spend_amount >= average * Decimal("2.5")
        low_confidence = row.needs_review or row.category_confidence < Decimal("0.70")
        if not (high_single_charge or high_vs_category or low_confidence):
            continue

        reason = "Large charge compared with this category"
        severity = "medium"
        if high_single_charge:
            reason = "Large single transaction"
            severity = "high"
        if low_confidence:
            reason = "Category needs human confirmation"
            severity = "medium"

        candidates.append(
            AnomalyCandidate(
                transaction_id=row.transaction_id,
                posted_at=row.posted_at.isoformat(),
                merchant=row.merchant_clean,
                category=row.category,
                amount=_money(row.spend_amount),
                reason=reason,
                severity=severity,
            )
        )
    return sorted(candidates, key=lambda row: (row.posted_at, row.transaction_id))[:10]


def _forecast_next_month(monthly: list[MonthlySummary]) -> ForecastRange:
    spending_values = [row.spending for row in monthly]
    target_month = _next_month(monthly[-1].month)
    average = sum(spending_values, Decimal("0.00")) / Decimal(len(spending_values))

    if len(spending_values) >= 3:
        recent_trend = (spending_values[-1] - spending_values[0]) / Decimal(len(spending_values) - 1)
        expected = average + recent_trend
        spread = max(spending_values) - min(spending_values)
        buffer = max(spread / Decimal("2"), expected * Decimal("0.10"), Decimal("75.00"))
        confidence = "medium"
        method = "three-month average with recent trend"
    else:
        expected = average
        buffer = max(expected * Decimal("0.15"), Decimal("75.00"))
        confidence = "low"
        method = "short-history average"

    low = max(Decimal("0.00"), expected - buffer)
    high = expected + buffer
    return ForecastRange(
        target_month=target_month,
        expected_spending=_money(expected),
        low=_money(low),
        high=_money(high),
        method=method,
        confidence=confidence,
    )


def _next_month(month: str) -> str:
    year, month_number = (int(part) for part in month.split("-"))
    if month_number == 12:
        return date(year + 1, 1, 1).strftime("%Y-%m")
    return date(year, month_number + 1, 1).strftime("%Y-%m")


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)
