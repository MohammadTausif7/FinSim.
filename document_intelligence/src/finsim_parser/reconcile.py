"""Check parsed totals against balances printed on the statement."""

from __future__ import annotations

from decimal import Decimal

from .models import ReconciliationReport, StatementMetadata, Transaction


TOLERANCE = Decimal("0.01")


def reconcile(
    metadata: StatementMetadata,
    transactions: list[Transaction],
) -> ReconciliationReport:
    if metadata.beginning_balance is None or metadata.ending_balance is None:
        return ReconciliationReport(status="unavailable")

    total = sum((transaction.amount for transaction in transactions), Decimal("0.00"))
    if metadata.account_type == "credit_card":
        calculated = metadata.beginning_balance - total
    else:
        calculated = metadata.beginning_balance + total

    difference = calculated - metadata.ending_balance
    running_errors: list[str] = []
    checked = 0
    if metadata.account_type == "checking":
        prior = metadata.beginning_balance
        for transaction in transactions:
            if transaction.balance is None:
                continue
            checked += 1
            expected = prior + transaction.amount
            if abs(expected - transaction.balance) > TOLERANCE:
                running_errors.append(transaction.transaction_id)
            prior = transaction.balance

    passed = abs(difference) <= TOLERANCE and not running_errors
    return ReconciliationReport(
        status="passed" if passed else "warning",
        expected_ending_balance=metadata.ending_balance,
        calculated_ending_balance=calculated,
        difference=difference,
        checked_running_balances=checked,
        running_balance_errors=running_errors,
    )
