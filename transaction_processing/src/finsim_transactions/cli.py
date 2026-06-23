"""Command line interface for FinSim transaction processing."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .contracts import ContractError
from .csv_io import write_processed
from .processor import process_files
from .rules import available_categories, load_rulebook


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="finsim-transform",
        description="Clean and categorize normalized FinSim transactions.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("categories", help="List categories in the active rulebook")

    process = commands.add_parser("process", help="Create a cleaned and categorized CSV")
    process.add_argument("--input", type=Path, nargs="+", required=True)
    process.add_argument("--output", type=Path, required=True)
    process.add_argument("--report", type=Path)
    process.add_argument("--rules", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "categories":
            rulebook = load_rulebook()
            print(
                json.dumps(
                    {
                        "rulebook_version": rulebook.version,
                        "categories": sorted(available_categories(rulebook)),
                    },
                    indent=2,
                )
            )
            return 0

        transactions, report = process_files(args.input, args.rules)
        write_processed(args.output, transactions)
        summary = report.as_dict()
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(summary, indent=2))
        return 0
    except (ContractError, FileNotFoundError, OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
