"""FinSim transaction cleaning, categorization, and review package."""

from .feedback import (
    FeedbackDecision,
    FeedbackResult,
    apply_feedback,
    parse_feedback_payload,
    read_merchant_rules,
    write_feedback_audit,
    write_merchant_rules,
)
from .processor import process_files

__all__ = [
    "FeedbackDecision",
    "FeedbackResult",
    "apply_feedback",
    "parse_feedback_payload",
    "process_files",
    "read_merchant_rules",
    "write_feedback_audit",
    "write_merchant_rules",
]

__version__ = "0.2.0"
