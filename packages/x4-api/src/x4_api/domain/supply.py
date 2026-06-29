"""Universe-wide ware market summary — the supply-chain shortage radar.

Cross live station offers (`station_offers`) with the static ware catalog (`s.wares`)
to surface, per ware: how much is for sale vs demanded across the universe, the best
buy/sell prices, and how current prices compare to the reference average. That imbalance
is the signal the in-game UI hides — where the economy is short (opportunity) or glutted.

Offer semantics: `side='sell'` = a station SELLS the ware (you buy there) → market
*supply*; `side='buy'` = a station BUYS it (you sell there) → market *demand*.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

# Demand/supply ratio past which a ware is flagged. 1.5 = 50% imbalance.
_IMBALANCE = 1.5

_QUERY = """
SELECT o.ware_id,
       w.name AS ware_name, w.group_id, w.price_avg AS ref_price,
       SUM(CASE WHEN o.side='sell' THEN o.quantity ELSE 0 END) AS sell_qty,
       SUM(CASE WHEN o.side='buy'  THEN o.quantity ELSE 0 END) AS buy_qty,
       SUM(CASE WHEN o.side='sell' THEN 1 ELSE 0 END) AS sell_offers,
       SUM(CASE WHEN o.side='buy'  THEN 1 ELSE 0 END) AS buy_offers,
       MIN(CASE WHEN o.side='sell' THEN o.price END) AS best_buy_price,
       MAX(CASE WHEN o.side='buy'  THEN o.price END) AS best_sell_price,
       AVG(o.price) AS avg_price
FROM station_offers o
LEFT JOIN s.wares w ON w.ware_id = o.ware_id
GROUP BY o.ware_id
"""


@dataclass(slots=True)
class WareMarket:
    ware_id: str
    ware_name: str | None
    group_id: str | None
    ref_price: int | None
    sell_offers: int
    sell_qty: int
    best_buy_price: int | None        # cheapest place to buy
    buy_offers: int
    buy_qty: int
    best_sell_price: int | None       # dearest place to sell
    avg_price: int
    net_demand: int                   # buy_qty - sell_qty; positive = under-supplied
    price_index: float | None         # avg market price / reference avg; >1 = elevated
    classification: str               # shortage | balanced | surplus


def _classify(sell_qty: int, buy_qty: int) -> str:
    if buy_qty > sell_qty * _IMBALANCE:
        return "shortage"
    if sell_qty > buy_qty * _IMBALANCE:
        return "surplus"
    return "balanced"


@dataclass(slots=True)
class WareOffer:
    station_id: str
    station_name: str | None
    station_code: str | None
    owner_faction: str | None   # faction_id — resolve to display name/colour on the client
    sector_id: str | None
    side: str           # 'sell' = station supplies it (you buy); 'buy' = station demands it (you sell)
    price: int
    quantity: int


# Procedural NPC stations carry no `name`; fall back to the in-game code, then the id, so the
# UI never shows a bare internal id. owner_faction + sector_id are resolved to display names
# client-side (factions / map-sectors are already cached there).
_OFFERS_QUERY = """
SELECT o.station_id,
       COALESCE(NULLIF(st.name, ''), NULLIF(st.code, ''), o.station_id) AS station_name,
       st.code AS station_code, st.owner_faction, st.sector_id,
       o.side, o.price, o.quantity
FROM station_offers o
LEFT JOIN stations st ON st.station_id = o.station_id
WHERE o.ware_id = ?
ORDER BY o.quantity DESC
"""


def ware_stations(conn: sqlite3.Connection, ware_id: str) -> list[WareOffer]:
    """Every station offer for one ware — drives the 'where is it short/hoarded?' drill-down."""
    return [
        WareOffer(
            station_id=r["station_id"],
            station_name=r["station_name"],
            station_code=r["station_code"],
            owner_faction=r["owner_faction"],
            sector_id=r["sector_id"],
            side=r["side"],
            price=r["price"],
            quantity=r["quantity"],
        )
        for r in conn.execute(_OFFERS_QUERY, (ware_id,)).fetchall()
    ]


def ware_market(conn: sqlite3.Connection) -> list[WareMarket]:
    """Per-ware market summary, most under-supplied first. Empty until a save loads."""
    out: list[WareMarket] = []
    for r in conn.execute(_QUERY).fetchall():
        sell_qty, buy_qty = r["sell_qty"] or 0, r["buy_qty"] or 0
        ref = r["ref_price"]
        avg_price = int(r["avg_price"] or 0)
        out.append(
            WareMarket(
                ware_id=r["ware_id"],
                ware_name=r["ware_name"],
                group_id=r["group_id"],
                ref_price=ref,
                sell_offers=r["sell_offers"] or 0,
                sell_qty=sell_qty,
                best_buy_price=r["best_buy_price"],
                buy_offers=r["buy_offers"] or 0,
                buy_qty=buy_qty,
                best_sell_price=r["best_sell_price"],
                avg_price=avg_price,
                net_demand=buy_qty - sell_qty,
                price_index=round(avg_price / ref, 2) if ref else None,
                classification=_classify(sell_qty, buy_qty),
            )
        )
    out.sort(key=lambda m: m.net_demand, reverse=True)
    return out
