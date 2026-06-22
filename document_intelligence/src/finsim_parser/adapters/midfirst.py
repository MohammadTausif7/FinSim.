"""Adapter for the checking statement layout used in the private references."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from .base import StatementAdapter
from ..extractors import PageText
from ..models import StatementMetadata, Transaction, TransactionKind
from ..text_utils import MONEY_PATTERN, clean_space, infer_date, money, stable_transaction_id


DATE_ROW = re.compile(r"^\s*(\d{1,2})[-/](\d{1,2})\s+(.+)$")
STATEMENT_END = re.compile(
    r"This\s+Statement\s*:?\s*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})",
    re.IGNORECASE,
)
BEGINNING_BALANCE = re.compile(r"Beginning\s+Balance\s*:?\s*\$?([\d,]+\.\d{2})", re.IGNORECASE)
ENDING_BALANCE = re.compile(r"Ending\s+Balance\s*:?\s*\$?([\d,]+\.\d{2})", re.IGNORECASE)


@dataclass(slots=True)
class PendingRow:
    month: int
    day: int
    description: str
    amount: Decimal
    balance: Decimal
    page_number: int
    method: str
    confidence: Decimal


class MidFirstAdapter(StatementAdapter):
    institution = "midfirst"

    @classmethod
    def matches(cls, text: str) -> bool:
        upper = text.upper().replace(" ", "")
        return "MIDFIRSTBANK" in upper or (
            "SOONERSTUDENTCHECKING" in upper and "ADDITIONS" in upper and "SUBTRACTIONS" in upper
        )

    def parse(
        self,
        pages: list[PageText],
        source_statement_id: str,
        source_path: Path,
    ) -> tuple[StatementMetadata, list[Transaction], list[str]]:
        combined = "\n".join(page.text for page in pages)
        period_end = self._period_end(combined)
        warnings: list[str] = []
        if period_end is None:
            period_end = datetime.fromtimestamp(source_path.stat().st_mtime).date()
            warnings.append("Statement end date was not found. File modification year was used.")

        metadata = StatementMetadata(
            institution=self.institution,
            account_type="checking",
            period_end=period_end,
            beginning_balance=self._first_money(BEGINNING_BALANCE, combined),
            ending_balance=self._first_money(ENDING_BALANCE, combined),
            source_statement_id=source_statement_id,
            extraction_method=pages[0].method if pages else "unknown",
            page_count=len(pages),
        )

        transactions: list[Transaction] = []
        pending: PendingRow | None = None
        for page in pages:
            for raw_line in page.text.splitlines():
                line = clean_space(raw_line)
                match = DATE_ROW.match(line)
                if not match:
                    if pending and self._is_useful_continuation(line):
                        pending.description = clean_space(f"{pending.description} {line}")
                    continue

                if pending:
                    self._append_transaction(
                        transactions,
                        pending,
                        period_end,
                        source_statement_id,
                        metadata.beginning_balance,
                    )
                    pending = None

                month, day, body = int(match.group(1)), int(match.group(2)), match.group(3)
                if "beginning balance" in body.lower():
                    values = MONEY_PATTERN.findall(body)
                    if values and metadata.beginning_balance is None:
                        metadata.beginning_balance = abs(money(values[-1]))
                    continue
                if "ending total" in body.lower():
                    values = MONEY_PATTERN.findall(body)
                    if values and metadata.ending_balance is None:
                        metadata.ending_balance = abs(money(values[-1]))
                    continue

                values = list(MONEY_PATTERN.finditer(body))
                if len(values) < 2:
                    continue
                amount_match, balance_match = values[-2], values[-1]
                description = clean_space(body[: amount_match.start()])
                amount = money(amount_match.group(1))
                balance = money(balance_match.group(1))
                pending = PendingRow(
                    month,
                    day,
                    description,
                    amount,
                    balance,
                    page.page_number,
                    page.method,
                    Decimal(str(page.confidence)),
                )

        if pending:
            self._append_transaction(
                transactions,
                pending,
                period_end,
                source_statement_id,
                metadata.beginning_balance,
            )

        if transactions:
            metadata.period_start = transactions[0].posted_at
            metadata.ending_balance = metadata.ending_balance or transactions[-1].balance
        else:
            warnings.append("No transaction rows were found in the checking statement.")
        return metadata, transactions, warnings

    @staticmethod
    def _period_end(text: str):
        match = STATEMENT_END.search(text)
        if not match:
            return None
        return datetime.strptime(" ".join(match.groups()), "%B %d %Y").date()

    @staticmethod
    def _first_money(pattern: re.Pattern[str], text: str) -> Decimal | None:
        match = pattern.search(text)
        return money(match.group(1)) if match else None

    @staticmethod
    def _is_useful_continuation(line: str) -> bool:
        if not line or len(line) > 100:
            return False
        blocked = (
            "date description",
            "page ",
            "midfirst",
            "total no.",
            "low balance",
            "beginning balance",
            "ending balance",
        )
        return not any(token in line.lower() for token in blocked)

    def _append_transaction(
        self,
        transactions: list[Transaction],
        row: PendingRow,
        period_end,
        source_statement_id: str,
        beginning_balance: Decimal | None,
    ) -> None:
        posted_at = infer_date(row.month, row.day, period_end)
        previous_balance = transactions[-1].balance if transactions else beginning_balance
        normalized_amount = self._normalize_amount(row.amount, row.balance, previous_balance)
        kind = self._kind(row.description, normalized_amount)
        ordinal = len(transactions)
        transactions.append(
            Transaction(
                transaction_id=stable_transaction_id(
                    source_statement_id, posted_at, row.description, normalized_amount, ordinal
                ),
                posted_at=posted_at,
                description_raw=row.description,
                amount=normalized_amount,
                transaction_type=kind,
                balance=row.balance,
                source_statement_id=source_statement_id,
                page_number=row.page_number,
                extraction_method=row.method,
                extraction_confidence=row.confidence,
            )
        )

    @staticmethod
    def _normalize_amount(
        printed_amount: Decimal,
        current_balance: Decimal,
        previous_balance: Decimal | None,
    ) -> Decimal:
        """Use the running balance to recover the addition or subtraction sign."""

        if printed_amount < 0 or previous_balance is None:
            return printed_amount
        balance_change = current_balance - previous_balance
        if abs(abs(balance_change) - abs(printed_amount)) <= Decimal("0.01"):
            return abs(printed_amount) if balance_change >= 0 else -abs(printed_amount)
        return printed_amount

    @staticmethod
    def _kind(description: str, amount: Decimal) -> TransactionKind:
        lowered = description.lower()
        if "refund" in lowered:
            return "refund"
        if "deposit" in lowered or "credit" in lowered:
            return "credit"
        if "transfer" in lowered or "zelle" in lowered:
            return "transfer"
        if "fee" in lowered:
            return "fee"
        if "interest" in lowered:
            return "interest"
        return "credit" if amount > 0 else "debit"
