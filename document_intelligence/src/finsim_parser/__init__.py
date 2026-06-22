"""FinSim statement extraction package."""

from .models import ParseResult, StatementMetadata, Transaction
from .pipeline import inspect_statement, parse_statement

__all__ = [
    "ParseResult",
    "StatementMetadata",
    "Transaction",
    "inspect_statement",
    "parse_statement",
]

__version__ = "0.1.0"
