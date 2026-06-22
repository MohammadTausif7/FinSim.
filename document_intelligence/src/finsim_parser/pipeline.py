"""Orchestrate safe statement inspection, extraction, parsing, and validation."""

from __future__ import annotations

from pathlib import Path

from .detector import select_adapter
from .extractors import (
    PageText,
    PdfAssessment,
    assess_pdf,
    extract_searchable_text,
    extract_with_tesseract,
)
from .models import ParseResult
from .reconcile import reconcile
from .text_utils import source_id_from_bytes


MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PAGES = 100


def inspect_statement(path: Path) -> PdfAssessment:
    _validate_input(path)
    assessment = assess_pdf(path)
    if assessment.page_count > MAX_PAGES:
        raise ValueError(f"Statement has more than the {MAX_PAGES} page limit")
    return assessment


def parse_statement(
    path: Path,
    method: str = "auto",
    institution: str | None = None,
) -> ParseResult:
    assessment = inspect_statement(path)
    chosen_method = assessment.recommended_method if method == "auto" else method
    if chosen_method == "text":
        pages = extract_searchable_text(path)
    elif chosen_method == "ocr":
        pages = extract_with_tesseract(path)
    else:
        raise ValueError("Extraction method must be auto, text, or ocr")
    return parse_pages(path, pages, institution)


def parse_pages(
    source_path: Path,
    pages: list[PageText],
    institution: str | None = None,
    source_statement_id: str | None = None,
) -> ParseResult:
    """Parse already extracted text. This seam also keeps tests private and fast."""

    if not pages:
        raise ValueError("The statement did not contain any pages")
    statement_id = source_statement_id or source_id_from_bytes(source_path.read_bytes())
    adapter = select_adapter(pages, institution)
    metadata, transactions, warnings = adapter.parse(pages, statement_id, source_path)
    report = reconcile(metadata, transactions)
    if report.status == "warning":
        warnings.append("Extracted amounts do not reconcile with the statement balances.")
    return ParseResult(metadata, transactions, report, warnings)


def _validate_input(path: Path) -> None:
    if path.suffix.lower() != ".pdf":
        raise ValueError("Input must be a PDF file")
    if not path.is_file():
        raise FileNotFoundError(f"Statement not found: {path}")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Statement exceeds the 25 MB size limit")
