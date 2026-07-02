"""Extract player P&L from the save's `<economylog>` block.

Structure (probed from quicksave.xml.gz, game 8.00):

    savegame(1) → economylog(2) → entries(3) type="cargo|tradeoffer|money|trade"
                                     → log(4)

Each `<log>` is one economic *event*. The `<entries type>` of its parent groups it:

    money       per-account money events  — balance/net-worth per player station/ship/empire
    trade       matched transactions      — buyer, seller, ware, price, quantity
    cargo       every cargo change        — universe-wide firehose (~1.2M rows)  ← SKIPPED
    tradeoffer  every offer posted        — universe-wide firehose (~1.0M rows)  ← SKIPPED

We keep only the small `money` + `trade` groups (~1.6K rows total). The firehose groups are
walked by the dispatch regardless (one `getparent().get("type")` rejects them) but never
stored — their ~200 MB / 2.1M rows aren't worth the per-save DB cost (see plan).

Tier: VOLATILE, but APPEND-ONLY. Unlike other collectors this returns () from tables() so the
pipeline never DELETEs these tables, and flush() uses INSERT OR IGNORE — re-ingesting a save
(or a rotated successor) accumulates the union of events instead of clobbering. The economylog
keeps only a rolling window, so accumulation is how history outlives a single save's window.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.dynamic.extractors.common import element_attrs, extra_json_from_attrs
from x4_extract.parsing import str_int
from x4_extract.savefile.dispatch import Registration, Target

_LOG_DEPTH = 4  # savegame(1) → economylog(2) → entries(3) → log(4)

_TRADE_MAPPED = frozenset({"time", "type", "ware", "buyer", "seller", "price", "v",
                           "b", "bmax", "s", "smax"})
_MONEY_MAPPED = frozenset({"time", "owner", "type", "v", "v2", "partner"})


@dataclass(slots=True)
class TradeRow:
    time: float
    ware: str | None
    buyer: str | None
    seller: str | None
    price: int | None
    v: int | None
    b: int | None
    bmax: int | None
    s: int | None
    smax: int | None
    extra_json: str | None


@dataclass(slots=True)
class MoneyRow:
    owner: str
    time: float
    type: str | None
    v: int | None
    v2: int | None
    partner: str | None
    extra_json: str | None


@dataclass(slots=True)
class EconomyLogCollector:
    trades: list[TradeRow] = field(default_factory=list)
    money: list[MoneyRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="log", depth=_LOG_DEPTH, parent_tag="entries"),
                visitor=self._on_log,
            ),
        ]

    def _on_log(self, elem: etree._Element) -> None:
        # The parent <entries type=...> is still live at the child's end event; one attr read
        # routes the row and rejects the cargo/tradeoffer firehose.
        parent = elem.getparent()
        group = parent.get("type") if parent is not None else None
        if group == "trade":
            self._on_trade(elem)
        elif group == "money":
            self._on_money(elem)

    def _on_trade(self, elem: etree._Element) -> None:
        time_raw = elem.get("time")
        if time_raw is None:
            return
        self.trades.append(
            TradeRow(
                time=float(time_raw),
                ware=elem.get("ware"),
                buyer=elem.get("buyer"),
                seller=elem.get("seller"),
                price=str_int(elem.get("price")),
                v=str_int(elem.get("v")),
                b=str_int(elem.get("b")),
                bmax=str_int(elem.get("bmax")),
                s=str_int(elem.get("s")),
                smax=str_int(elem.get("smax")),
                extra_json=extra_json_from_attrs(element_attrs(elem), _TRADE_MAPPED),
            )
        )

    def _on_money(self, elem: etree._Element) -> None:
        owner = elem.get("owner")
        time_raw = elem.get("time")
        if owner is None or time_raw is None:
            return
        self.money.append(
            MoneyRow(
                owner=owner,
                time=float(time_raw),
                type=elem.get("type"),
                v=str_int(elem.get("v")),
                v2=str_int(elem.get("v2")),
                partner=elem.get("partner"),
                extra_json=extra_json_from_attrs(element_attrs(elem), _MONEY_MAPPED),
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        # Intentionally empty: these tables are append-only and must NOT be cleared on a
        # tier rewrite. flush() persists via INSERT OR IGNORE instead.
        return ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(
            [
                *({"t": dataclasses.asdict(r)} for r in self.trades),
                *({"m": dataclasses.asdict(r)} for r in self.money),
            ]
        )

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE):
            return
        if self.trades:
            conn.executemany(
                """
                INSERT OR IGNORE INTO economy_trade
                    (time, ware, buyer, seller, price, v, b, bmax, s, smax, extra_json)
                VALUES (:time, :ware, :buyer, :seller, :price, :v, :b, :bmax, :s, :smax,
                        :extra_json)
                """,
                [dataclasses.asdict(r) for r in self.trades],
            )
        if self.money:
            conn.executemany(
                """
                INSERT OR IGNORE INTO economy_money (owner, time, type, v, v2, partner, extra_json)
                VALUES (:owner, :time, :type, :v, :v2, :partner, :extra_json)
                """,
                [dataclasses.asdict(r) for r in self.money],
            )
