"""Select the parser that understands a statement layout."""

from __future__ import annotations

from .adapters.base import StatementAdapter
from .adapters.bank_of_america import BankOfAmericaAdapter
from .adapters.discover import DiscoverAdapter
from .adapters.midfirst import MidFirstAdapter
from .extractors import PageText


SUPPORTED_ADAPTERS: tuple[type[StatementAdapter], ...] = (
    BankOfAmericaAdapter,
    DiscoverAdapter,
    MidFirstAdapter,
)


class UnsupportedStatementError(ValueError):
    pass


def select_adapter(pages: list[PageText], institution: str | None = None) -> StatementAdapter:
    """Choose by explicit name or strong text markers."""

    if institution:
        requested = institution.strip().lower()
        for adapter_type in SUPPORTED_ADAPTERS:
            if adapter_type.institution == requested:
                return adapter_type()
        supported = ", ".join(adapter.institution for adapter in SUPPORTED_ADAPTERS)
        raise UnsupportedStatementError(f"Unknown institution {institution!r}. Supported values: {supported}")

    combined = "\n".join(page.text for page in pages)
    matches = [adapter_type for adapter_type in SUPPORTED_ADAPTERS if adapter_type.matches(combined)]
    if len(matches) == 1:
        return matches[0]()
    if len(matches) > 1:
        raise UnsupportedStatementError("More than one statement layout matched. Choose --institution.")
    raise UnsupportedStatementError(
        "This statement layout is not supported yet. Add an adapter or choose --institution."
    )
