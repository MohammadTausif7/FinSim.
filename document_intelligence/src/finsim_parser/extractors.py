"""PDF inspection plus searchable text and optional OCR extraction."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


@dataclass(frozen=True, slots=True)
class PageText:
    page_number: int
    text: str
    method: str
    confidence: float


@dataclass(frozen=True, slots=True)
class PdfAssessment:
    page_count: int
    text_characters: int
    average_characters_per_page: float
    image_count: int
    recommended_method: str


class OcrUnavailableError(RuntimeError):
    pass


def assess_pdf(path: Path, minimum_chars_per_page: int = 180) -> PdfAssessment:
    """Decide whether the embedded text is useful or OCR is required."""

    with pdfplumber.open(path) as pdf:
        text_characters = 0
        image_count = 0
        for page in pdf.pages:
            text_characters += len((page.extract_text() or "").strip())
            image_count += len(page.images)
        page_count = len(pdf.pages)

    average = text_characters / page_count if page_count else 0
    method = "text" if average >= minimum_chars_per_page else "ocr"
    return PdfAssessment(page_count, text_characters, average, image_count, method)


def extract_searchable_text(path: Path) -> list[PageText]:
    with pdfplumber.open(path) as pdf:
        return [
            PageText(page.page_number, page.extract_text(x_tolerance=2, y_tolerance=3) or "", "text", 1.0)
            for page in pdf.pages
        ]


def extract_with_tesseract(path: Path, dpi: int = 300) -> list[PageText]:
    """Render pages and OCR them locally. No page data leaves the computer."""

    pdftoppm = shutil.which("pdftoppm")
    tesseract = shutil.which("tesseract")
    if not pdftoppm or not tesseract:
        missing = [name for name, executable in (("pdftoppm", pdftoppm), ("tesseract", tesseract)) if not executable]
        raise OcrUnavailableError(
            "OCR is required for this statement. Install the missing local tools: " + ", ".join(missing)
        )

    pages: list[PageText] = []
    with tempfile.TemporaryDirectory(prefix="finsim-ocr-") as directory:
        prefix = Path(directory) / "page"
        render = subprocess.run(
            [pdftoppm, "-png", "-r", str(dpi), str(path), str(prefix)],
            check=False,
            capture_output=True,
            text=True,
        )
        if render.returncode != 0:
            raise RuntimeError("PDF rendering failed before OCR")

        images = sorted(Path(directory).glob("page-*.png"))
        for page_number, image in enumerate(images, start=1):
            ocr = subprocess.run(
                [tesseract, str(image), "stdout", "--psm", "6"],
                check=False,
                capture_output=True,
                text=True,
            )
            if ocr.returncode != 0:
                raise RuntimeError(f"OCR failed on page {page_number}")
            pages.append(PageText(page_number, ocr.stdout, "ocr", 0.82))
    return pages
