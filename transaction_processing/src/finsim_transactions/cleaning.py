"""Normalize noisy statement descriptions without changing raw evidence."""

from __future__ import annotations

import re
import unicodedata


SPACE = re.compile(r"\s+")
LONG_NUMBER = re.compile(r"\b\d{6,}\b")
REFERENCE = re.compile(r"\b(?:CONF|REF|TRACE|AUTH|TRAN)\s*[#:]?\s*[A-Z0-9-]{4,}\b", re.IGNORECASE)
PHONE = re.compile(r"\b(?:\d{3}[-. ]?)?\d{3}[-. ]\d{4}\b")
WEB = re.compile(r"\b(?:HTTPS?://|WWW\.)\S+|\b\S+\.(?:COM|NET|ORG)\b", re.IGNORECASE)
PREFIX = re.compile(
    r"^(?:POS|ACH|DEBIT CARD|CHECKCARD|RECURRING|PURCHASE|ONLINE PAYMENT|CARD PURCHASE)\s+",
    re.IGNORECASE,
)
LOCATION_ENDING = re.compile(r"\s+[A-Z]{2}\s*$")


def normalize_description(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = "".join(character for character in normalized if character.isprintable())
    normalized = normalized.replace("*", " ").replace("_", " ")
    normalized = SPACE.sub(" ", normalized).strip().upper()
    return normalized


def clean_merchant(value: str, aliases: list[dict[str, object]]) -> str:
    normalized = normalize_description(value)
    for alias in aliases:
        keywords = [str(keyword).upper() for keyword in alias.get("keywords", [])]
        if any(keyword in normalized for keyword in keywords):
            return str(alias["merchant"])

    cleaned = normalized
    cleaned = PREFIX.sub("", cleaned)
    cleaned = REFERENCE.sub("", cleaned)
    cleaned = PHONE.sub("", cleaned)
    cleaned = WEB.sub("", cleaned)
    cleaned = LONG_NUMBER.sub("", cleaned)
    cleaned = LOCATION_ENDING.sub("", cleaned)
    cleaned = SPACE.sub(" ", cleaned).strip(" -#.,")

    return cleaned.title() or "Unknown merchant"
