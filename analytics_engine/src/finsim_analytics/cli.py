"""Command line helper for generating an analytics report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .analyzer import build_report
from .csv_io import read_processed_transactions


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a FinSim analytics report from processed transactions.")
    parser.add_argument("input_csv", type=Path, help="Processed transaction CSV from the categorization pipeline")
    parser.add_argument("--output", type=Path, help="Optional JSON output path")
    args = parser.parse_args(argv)

    report = build_report(read_processed_transactions(args.input_csv))
    payload = json.dumps(report.as_dict(), indent=2)

    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0
