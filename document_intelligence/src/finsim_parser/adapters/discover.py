"""Adapter for searchable Discover credit card statements."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from .base import StatementAdapter
from ..extractors import PageText
from ..models import StatementMetadata, Transaction
from ..text_utils import MONEY_PATTERN, clean_space, infer_date, money, stable_transaction_id


DATE_ROW = re.compile(r"^\s*(\d{1,2})/(\d{1,2})\s+(.+)$")
PERIOD = re.compile(
    r"OPEN\s+TO\s+CLOSE\s+DATE\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})\s*[- ]+\s*(\d{1,2}/\d{1,2}/\d{4})",
    re.IGNORECASE,
)
PREVIOUS_BALANCE = re.compile(r"Previous\s*Balance\s*\$?([\d,]+\.\d{2})", re.IGNORECASE)
NEW_BALANCE = re.compile(r"New\s*Balance\s*:?\s*\$?([\d,]+\.\d{2})", re.IGNORECASE)
CATEGORIES = sorted(
    {
        "Travel/Entertainment",
        "Department Store",
        "Home Improvement",
        "Gasoline",
        "Groceries",
        "Merchandise",
        "Restaurants",
        "Services",
        "Supermarkets",
    },
    key=len,
    reverse=True,
)


class DiscoverAdapter(StatementAdapter):
    institution = "discover"

    @classmethod
    def matches(cls, text: str) -> bool:
        upper = text.upper().replace(" ", "")
        return "DISCOVER" in upper and (
            "PAYMENTSANDCREDITS" in upper or "CASHBACKBONUS" in upper or "CARDENDINGIN" in upper
        )

    def parse(
        self,
        pages: list[PageText],
        source_statement_id: str,
        source_path: Path,
    ) -> tuple[StatementMetadata, list[Transaction], list[str]]:
        combined = "\n".join(page.text for page in pages)
        period_match = PERIOD.search(combined)
        warnings: list[str] = []
        if period_match:
            period_start = datetime.strptime(period_match.group(1), "%m/%d/%Y").date()
            period_end = datetime.strptime(period_match.group(2), "%m/%d/%Y").date()
        else:
            period_start = None
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
                upper = line.upper().replace(" ", "")
                if "DATEPAYMENTSANDCREDITSAMOUNT" in upper:
                    section = "payments"
                    continue
                if "DATEPURCHASESMERCHANTCATEGORYAMOUNT" in upper:
                    section = "purchases"
                    continue
                if "FEESANDINTERESTCHARGED" in upper or "TOTALFEESFORTHISPERIOD" in upper:
                    section = "finished"
                    continue
                if section not in {"payments", "purchases"}:
                    continue

                match = DATE_ROW.match(line)
                if not match:
                    continue
                month, day, body = int(match.group(1)), int(match.group(2)), match.group(3)
                amount_match = MONEY_PATTERN.search(body)
                if not amount_match:
                    continue
                description_and_category = clean_space(body[: amount_match.start()])
                category = self._category(description_and_category)
                description = description_and_category
                if category:
                    description = clean_space(description_and_category[: -len(category)])

                printed_amount = money(amount_match.group(1))
                if section == "payments":
                    normalized_amount = abs(printed_amount)
                    kind = "payment"
                else:
                    normalized_amount = -abs(printed_amount)
                    kind = "debit"

                posted_at = infer_date(month, day, period_end)
                ordinal = len(transactions)
                transactions.append(
                    Transaction(
                        transaction_id=stable_transaction_id(
                            source_statement_id, posted_at, description, normalized_amount, ordinal
                        ),
                        posted_at=posted_at,
                        description_raw=description,
                        amount=normalized_amount,
                        transaction_type=kind,
                        category_raw=category,
                        source_statement_id=source_statement_id,
                        page_number=page.page_number,
                        extraction_method=page.method,
                        extraction_confidence=Decimal(str(page.confidence)),
                    )
                )

        if not transactions:
            warnings.append("No transaction rows were found in the credit card statement.")
        return metadata, transactions, warnings

    @staticmethod
    def _first_money(pattern: re.Pattern[str], text: str) -> Decimal | None:
        match = pattern.search(text)
        return money(match.group(1)) if match else None

    @staticmethod
    def _category(value: str) -> str | None:
        lowered = value.lower()
        for category in CATEGORIES:
            if lowered.endswith(category.lower()):
                return category
        return None
