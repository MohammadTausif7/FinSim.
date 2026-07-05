from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from finsim_transactions.cleaning import clean_merchant, normalize_description
from finsim_transactions.models import SourceTransaction
from finsim_transactions.rules import load_rulebook


def sample_transaction(**changes) -> SourceTransaction:
    values = {
        "transaction_id": "sample",
        "posted_at": date(2026, 1, 2),
        "description_raw": "LOCAL SHOP",
        "amount": Decimal("-10.00"),
        "currency": "USD",
        "transaction_type": "debit",
        "balance": None,
        "category_raw": None,
        "source_statement_id": "statement",
        "page_number": 1,
        "extraction_method": "text",
        "extraction_confidence": Decimal("1.00"),
        "pipeline_version": "0.1.0",
    }
    values.update(changes)
    return SourceTransaction(**values)


class CleaningAndRuleTests(unittest.TestCase):
    def test_description_normalization_is_repeatable(self) -> None:
        self.assertEqual(normalize_description("  Café   Shop  "), "CAFÉ SHOP")

    def test_merchant_cleaning_removes_statement_noise_and_uses_alias(self) -> None:
        rulebook = load_rulebook()
        merchant = clean_merchant("POS STARBUCKS REF#ABCD1234 405-555-1212 OK", rulebook.aliases)
        self.assertEqual(merchant, "Starbucks")

    def test_bank_category_has_priority_over_keyword_rules(self) -> None:
        rulebook = load_rulebook()
        transaction = sample_transaction(
            description_raw="SAMPLE CAFE",
            category_raw="Travel/Entertainment",
        )
        decision = rulebook.categorize(transaction, "Sample Cafe")
        self.assertEqual(decision.category, "Travel")
        self.assertEqual(decision.source, "bank")

    def test_unknown_credit_is_flaggable_instead_of_assumed_income(self) -> None:
        rulebook = load_rulebook()
        transaction = sample_transaction(amount=Decimal("10.00"), transaction_type="credit")
        decision = rulebook.categorize(transaction, "Local Shop")
        self.assertEqual(decision.category, "Credits")
        self.assertEqual(decision.confidence, Decimal("0.40"))

    def test_common_statement_merchants_use_clean_names_and_categories(self) -> None:
        rulebook = load_rulebook()
        cases = [
            ("WAL-MART #0123 OKLAHOMA CITY OK", "Walmart", "Shopping"),
            ("COSTCO WHSE #1205", "Costco", "Groceries"),
            ("EXPEDIA 729184", "Expedia", "Travel"),
            ("LYFT *RIDE FRI", "Lyft", "Transport"),
            ("BRAUMS STORE 42", "Braum's", "Dining"),
            ("IC INSTACART INSTACART CA", "Instacart", "Groceries"),
            ("COX OKLAHOMA COMM SV", "Cox Communications", "Utilities"),
            ("NNT BESTBUY MKTPL", "Best Buy", "Shopping"),
            ("OPENAI CHATGPT SUBSCR", "ChatGPT", "Subscriptions"),
            ("TACO BELL NORMAN OK", "Taco Bell", "Dining"),
            ("MINT MOBILE 800 683", "Mint Mobile", "Utilities"),
            ("EBAY O 09", "eBay", "Shopping"),
            ("TURKISH AIRL TICKET", "Turkish Airlines", "Travel"),
            ("SAMSCLUB.COM 8887467726 AR", "Sam's Club", "Groceries"),
            ("TGT STORE 2201 NORMAN OK", "Target", "Shopping"),
            ("THE HOME DEPOT #3907", "Home Depot", "Housing"),
            ("LOWES #0123 OKC OK", "Lowe's", "Housing"),
            ("WALGREENS STORE 12905", "Walgreens", "Healthcare"),
            ("RITE AID STORE 06123", "Rite Aid", "Healthcare"),
            ("PUBLIX SUPER MARKET #1142", "Publix", "Groceries"),
            ("SAFEWAY STORE0007", "Safeway", "Groceries"),
            ("HEB GROCERY 589", "H-E-B", "Groceries"),
            ("DOLLAR GENERAL #10420", "Dollar General", "Shopping"),
            ("TJX TJ MAXX #0873", "TJ Maxx", "Shopping"),
            ("SEPHORA 000123", "Sephora", "Shopping"),
            ("PETSMART INC 1234", "PetSmart", "Shopping"),
            ("SHELL OIL 574442", "Shell", "Transport"),
            ("MURPHY USA #7521", "Murphy USA", "Transport"),
            ("CHICK-FIL-A #03918", "Chick-fil-A", "Dining"),
            ("DD *DOORDASH DASHPASS", "DoorDash", "Dining"),
            ("VENMO PAYMENT JOHN", "Venmo", "Transfers"),
            ("CASH APP*SAMPLE NAME", "Cash App", "Transfers"),
            ("UPS STORE 4783", "UPS", "Services"),
        ]
        for description, expected_merchant, expected_category in cases:
            with self.subTest(description=description):
                transaction = sample_transaction(description_raw=description)
                merchant = clean_merchant(description, rulebook.aliases)
                decision = rulebook.categorize(transaction, merchant)
                self.assertEqual(merchant, expected_merchant)
                self.assertEqual(decision.category, expected_category)
                self.assertGreaterEqual(decision.confidence, Decimal("0.80"))

    def test_zelle_is_a_transfer_for_both_money_directions(self) -> None:
        rulebook = load_rulebook()
        for amount, transaction_type in (
            (Decimal("-45.00"), "debit"),
            (Decimal("75.00"), "credit"),
        ):
            transaction = sample_transaction(
                description_raw="ZELLE PAYMENT SAMPLE PERSON",
                amount=amount,
                transaction_type=transaction_type,
            )
            merchant = clean_merchant(transaction.description_raw, rulebook.aliases)
            decision = rulebook.categorize(transaction, merchant)
            self.assertEqual(merchant, "Zelle")
            self.assertEqual(decision.category, "Transfers")
            self.assertEqual(decision.source, "rulebook")


if __name__ == "__main__":
    unittest.main()
