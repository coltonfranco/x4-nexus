"""Per-request trade-route scoring over the materialized candidate pairs.

The single best buy→sell pair per ware is precomputed at ingest (`top_routes_per_ware`)
to dodge the ~31M-row `station_offers` self-join (AGENTS.md §8). Scoring those candidates
against a specific ship is then cheap — one row per ware, no join explosion — so it lives
here in the domain layer and runs per request with the caller's cargo/speed.

Profit model (deliberately transparent, not a physics sim):
  units_per_trip   = min(offered qty, ship_cargo / ware_volume)
  profit_per_trip  = units_per_trip * margin
  trip_seconds     ≈ (hops + 1) * SECTOR_HOP_M / ship_speed * round-trip
  est_profit_per_hour = profit_per_trip / trip_hours   ← ranking key
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

_SECTOR_HOP_M = 50_000.0  # rough per-sector traversal distance, metres
_ROUND_TRIP = 2.0  # out laden, back empty
_DEFAULT_HOPS = 8  # when sector_distance is unknown (static map not built / cross-DLC)

_QUERY = """
SELECT t.ware_id, w.name AS ware_name, w.volume,
       t.buy_station_id,  bs.name AS buy_station_name,  bs.sector_id AS buy_sector,
       t.sell_station_id, ss.name AS sell_station_name, ss.sector_id AS sell_sector,
       t.margin, t.qty,
       bo.price AS buy_price,   -- you buy here (station's sell offer)
       so.price AS sell_price,  -- you sell here (station's buy offer)
       d.hops AS hops,
       d.manual_distance,
       d.fast_travel_time
FROM top_routes_per_ware t
LEFT JOIN s.wares w ON w.ware_id = t.ware_id
LEFT JOIN stations bs ON bs.station_id = t.buy_station_id
LEFT JOIN stations ss ON ss.station_id = t.sell_station_id
LEFT JOIN station_offers bo
       ON bo.station_id = t.buy_station_id AND bo.ware_id = t.ware_id AND bo.side = 'sell'
LEFT JOIN station_offers so
       ON so.station_id = t.sell_station_id AND so.ware_id = t.ware_id AND so.side = 'buy'
LEFT JOIN sector_distance d
       ON LOWER(d.from_sector_id) = LOWER(bs.sector_id)
      AND LOWER(d.to_sector_id) = LOWER(ss.sector_id)
"""


@dataclass(slots=True)
class RankedRoute:
    ware_id: str
    ware_name: str | None
    buy_station_id: str
    buy_station_name: str | None
    buy_sector: str | None
    sell_station_id: str
    sell_station_name: str | None
    sell_sector: str | None
    buy_price: int | None
    sell_price: int | None
    margin: int
    units_per_trip: int
    profit_per_trip: int
    hops: int | None
    est_profit_per_hour: int


def rank_routes(
    conn: sqlite3.Connection, *, ship_cargo: int, ship_speed: float, limit: int
) -> list[RankedRoute]:
    """Score + rank the materialized route candidates for a ship. Empty until a save loads."""
    out: list[RankedRoute] = []
    for r in conn.execute(_QUERY).fetchall():
        volume = r["volume"] or 1.0
        cargo_units = int(ship_cargo // volume) if volume > 0 else r["qty"]
        units = min(r["qty"], cargo_units)
        if units <= 0:
            continue
        profit = units * r["margin"]

        hops = r["hops"]
        manual_distance = r["manual_distance"]
        fast_travel_time = r["fast_travel_time"]

        if manual_distance is not None and fast_travel_time is not None:
            # We add one baseline SECTOR_HOP_M to represent the "last mile" flight
            # from the gates to the exact stations.
            one_way_seconds = (manual_distance + _SECTOR_HOP_M) / max(
                ship_speed, 1.0
            ) + fast_travel_time
            trip_seconds = one_way_seconds * _ROUND_TRIP
        else:
            eff_hops = hops if hops is not None else _DEFAULT_HOPS
            trip_seconds = (eff_hops + 1) * _SECTOR_HOP_M / max(ship_speed, 1.0) * _ROUND_TRIP

        per_hour = profit / (trip_seconds / 3600.0) if trip_seconds > 0 else float(profit)

        out.append(
            RankedRoute(
                ware_id=r["ware_id"],
                ware_name=r["ware_name"],
                buy_station_id=r["buy_station_id"],
                buy_station_name=r["buy_station_name"],
                buy_sector=r["buy_sector"],
                sell_station_id=r["sell_station_id"],
                sell_station_name=r["sell_station_name"],
                sell_sector=r["sell_sector"],
                buy_price=r["buy_price"],
                sell_price=r["sell_price"],
                margin=r["margin"],
                units_per_trip=units,
                profit_per_trip=profit,
                hops=hops,
                est_profit_per_hour=int(per_hour),
            )
        )

    out.sort(key=lambda x: x.est_profit_per_hour, reverse=True)
    return out[:limit]
