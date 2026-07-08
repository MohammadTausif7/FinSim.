"""Command line entry point for local statement processing."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from .csv_writer import write_transactions
from .pipeline import inspect_statement, parse_statement


VERIFIED_LAYOUTS = [
    {"institution": "bank_of_america", "account_type": "credit_card", "method": "text"},
    {"institution": "bank_of_america", "account_type": "checking", "method": "text"},
    {"institution": "discover", "account_type": "credit_card", "method": "text"},
    {"institution": "midfirst", "account_type": "checking", "method": "ocr"},
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="finsim-parse",
        description="Inspect and parse FinSim bank statements locally.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("supported", help="List statement layouts verified by tests")

    inspect_command = commands.add_parser("inspect", help="Check whether a PDF needs OCR")
    inspect_command.add_argument("statement", type=Path)

    parse_command = commands.add_parser("parse", help="Extract transactions into a normalized CSV")
    parse_command.add_argument("statement", type=Path)
    parse_command.add_argument("--output", type=Path, required=True)
    parse_command.add_argument("--report", type=Path)
    parse_command.add_argument("--method", choices=("auto", "text", "ocr"), default="auto")
    parse_command.add_argument(
        "--institution",
        choices=("bank_of_america", "discover", "midfirst"),
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "supported":
            print(json.dumps({"verified_layouts": VERIFIED_LAYOUTS}, indent=2))
            return 0
        if args.command == "inspect":
            assessment = inspect_statement(args.statement)
            print(json.dumps(asdict(assessment), indent=2))
            return 0

        result = parse_statement(args.statement, args.method, args.institution)
        write_transactions(args.output, result.transactions)
        summary = result.summary()
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(summary, indent=2))
        return 0
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
