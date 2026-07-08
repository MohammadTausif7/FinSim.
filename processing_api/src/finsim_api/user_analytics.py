"""Build account-level analytics from transactions saved after processing."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from finsim_analytics import build_report
from finsim_analytics.models import ProcessedTransaction as AnalyticsTransaction


def account_analytics_payload(
    transactions: list[dict[str, object]],
    *,
    latest_batch: dict[str, object] | None = None,
) -> dict[str, object]:
    """Return dashboard-ready analytics for a signed-in user's saved history."""

    analytics_rows = [_to_analytics_transaction(row) for row in transactions]
    report = build_report(analytics_rows)
    return {
        "source": "saved-user-transactions",
        "transaction_count": len(analytics_rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "latest_batch": latest_batch,
        "analytics": report.as_dict(),
    }


def _to_analytics_transaction(row: dict[str, object]) -> AnalyticsTransaction:
    return AnalyticsTransaction(
        transaction_id=str(row["transaction_id"]),
        posted_at=date.fromisoformat(str(row["posted_at"])),
        merchant_clean=str(row["merchant_clean"]),
        amount=Decimal(str(row["amount"])),
        currency=str(row["currency"]),
        transaction_type=str(row["transaction_type"]),
        category=str(row["category"]),
        category_confidence=Decimal(str(row["category_confidence"])),
        needs_review=bool(row["needs_review"]),
        category_source=str(row.get("category_source", "")),
    )
