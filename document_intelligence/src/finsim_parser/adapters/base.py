"""Common interface implemented by each statement layout adapter."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from ..extractors import PageText
from ..models import StatementMetadata, Transaction


class StatementAdapter(ABC):
    institution: str

    @classmethod
    @abstractmethod
    def matches(cls, text: str) -> bool:
        """Return true only when the layout has strong identifying markers."""

    @abstractmethod
    def parse(
        self,
        pages: list[PageText],
        source_statement_id: str,
        source_path: Path,
    ) -> tuple[StatementMetadata, list[Transaction], list[str]]:
        """Parse metadata and transactions from page text."""
