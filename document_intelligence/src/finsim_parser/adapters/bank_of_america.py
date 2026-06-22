"""Adapter for searchable Bank of America consumer credit card statements."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from .base import StatementAdapter
from ..extractors import PageText
from ..models import StatementMetadata, Transaction
from ..text_utils import MONEY_PATTERN, clean_space, infer_date, money, stable_transaction_id


DATE_ROW = re.compile(r"^\s*(\d{1,2})/(\d{1,2})\s+(\d{1,2})/(\d{1,2})\s+(.+)$")
REFERENCE_COLUMNS = re.compile(r"\s+\d{4}\s+\d{4}$")
PERIOD = re.compile(
    r"([A-Za-z]+)\s+(\d{1,2})\s+-\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})",
    re.IGNORECASE,
)
PREVIOUS_BALANCE = re.compile(r"Previous\s+Balance\s+\$?([\d,]+\.\d{2})", re.IGNORECASE)
NEW_BALANCE = re.compile(r"New\s+Balance\s+Total\s+\$?([\d,]+\.\d{2})", re.IGNORECASE)


class BankOfAmericaAdapter(StatementAdapter):
    institution = "bank_of_america"

    @classmethod
    def matches(cls, text: str) -> bool:
        upper = text.upper().replace(" ", "")
        return "BANKOFAMERICA" in upper and (
            "PURCHASESANDADJUSTMENTS" in upper
            or "ACCOUNTSUMMARY/PAYMENTINFORMATION" in upper
        )

    def parse(
        self,
        pages: list[PageText],
        source_statement_id: str,
        source_path: Path,
    ) -> tuple[StatementMetadata, list[Transaction], list[str]]:
        combined = "\n".join(page.text for page in pages)
        period_start, period_end = self._period(combined)
        warnings: list[str] = []
        if period_end is None:
            period_end = datetime.fromtimestamp(source_path.stat().st_mtime).date()
            warnings.append("Statement period was not found. File modification year was used.")

        metadata = StatementMetadata(
            institution=self.institution,
            account_type="credit_card",
            period_start=period_start,
            period_end=period_end,
            beginning_balance=self._first_money(PREVIOUS_BALANCE, combined),
            ending_balance=self._first_money(NEW_BALANCE, combined),
            source_statement_id=source_statement_id,
            extraction_method=pages[0].method if pages else "unknown",
            page_count=len(pages),
        )

        transactions: list[Transaction] = []
        section = "unknown"
        for page in pages:
            for raw_line in page.text.splitlines():
                line = clean_space(raw_line)
                lowered = line.lower()
                if lowered == "payments and other credits":
                    section = "payments"
                    continue
                if lowered == "purchases and adjustments":
                    section = "purchases"
                    continue
                if lowered == "fees charged":
                    section = "fees"
                    continue
                if lowered == "interest charged":
                    section = "interest"
                    continue
                if lowered.startswith("total "):
                    continue
                if section not in {"payments", "purchases", "fees", "interest"}:
                    continue

                match = DATE_ROW.match(line)
                if not match:
                    continue
                posting_month = int(match.group(3))
                posting_day = int(match.group(4))
                body = match.group(5)
                values = list(MONEY_PATTERN.finditer(body))
                if not values:
                    continue
                amount_match = values[-1]
                printed_amount = money(amount_match.group(1))
                if printed_amount == 0:
                    continue

                description = clean_space(body[: amount_match.start()])
                description = clean_space(REFERENCE_COLUMNS.sub("", description))
                normalized_amount, kind = self._normalize(section, printed_amount)
                posted_at = infer_date(posting_month, posting_day, period_end)

                ordinal = len(transactions)
                transactions.append(
                    Transaction(
                        transaction_id=stable_transaction_id(
                            source_statement_id,
                            posted_at,
                            description,
                            normalized_amount,
                            ordinal,
                        ),
                        posted_at=posted_at,
                        description_raw=description,
                        amount=normalized_amount,
                        transaction_type=kind,
                        source_statement_id=source_statement_id,
                        page_number=page.page_number,
                        extraction_method=page.method,
                        extraction_confidence=Decimal(str(page.confidence)),
                    )
                )

        if not transactions:
            warnings.append("No transaction rows were found in the Bank of America statement.")
        return metadata, transactions, warnings

    @staticmethod
    def _period(text: str):
        match = PERIOD.search(text)
        if not match:
            return None, None
        start_month, start_day, end_month, end_day, end_year = match.groups()
        end = datetime.strptime(f"{end_month} {end_day} {end_year}", "%B %d %Y").date()
        start_year = end.year - 1 if datetime.strptime(start_month, "%B").month > end.month else end.year
        start = datetime.strptime(f"{start_month} {start_day} {start_year}", "%B %d %Y").date()
        return start, end

    @staticmethod
    def _first_money(pattern: re.Pattern[str], text: str) -> Decimal | None:
        match = pattern.search(text)
        return money(match.group(1)) if match else None

    @staticmethod
    def _normalize(section: str, printed_amount: Decimal):
        if section == "payments":
            return abs(printed_amount), "payment"
        if printed_amount < 0:
            return abs(printed_amount), "refund"
        if section == "fees":
            return -printed_amount, "fee"
        if section == "interest":
            return -printed_amount, "interest"
        return -printed_amount, "debit"
