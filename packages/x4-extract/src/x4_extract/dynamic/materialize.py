"""Materialize `top_routes_per_ware` from current station offers.

Volatile artifact — recomputed whenever offers change. This is the deliberately small
half of the route problem: the naive `station_offers JOIN station_offers` over all
wares produces ~31M pairs (AGENTS.md §8), so here we precompute only the single best
buy→sell candidate per ware. Richer per-request scoring (cargo size, distance, taxes)
stays in the API's `domain/routes.py`.

Offer semantics: a `side='sell'` offer means the station SELLS the ware (you buy there);
`side='buy'` means the station BUYS it (you sell there). A profitable route buys at the
cheapest 'sell' and sells at the dearest 'buy'.
"""

from __future__ import annotations

import sqlite3

_TOP_ROUTE_SQL = """
INSERT OR REPLACE INTO top_routes_per_ware
    (ware_id, buy_station_id, sell_station_id, margin, qty, raw_score)
WITH src AS (  -- cheapest place to buy each ware (station is selling)
    SELECT ware_id, station_id, price, quantity,
           ROW_NUMBER() OVER (PARTITION BY ware_id ORDER BY price ASC, station_id) AS rn
    FROM station_offers WHERE side = 'sell'
),
snk AS (  -- dearest place to sell each ware (station is buying)
    SELECT ware_id, station_id, price, quantity,
           ROW_NUMBER() OVER (PARTITION BY ware_id ORDER BY price DESC, station_id) AS rn
    FROM station_offers WHERE side = 'buy'
)
SELECT src.ware_id,
       src.station_id AS buy_station_id,
       snk.station_id AS sell_station_id,
       snk.price - src.price AS margin,
       MIN(src.quantity, snk.quantity) AS qty,
       CAST((snk.price - src.price) AS REAL) * MIN(src.quantity, snk.quantity) AS raw_score
FROM src
JOIN snk ON snk.ware_id = src.ware_id AND src.rn = 1 AND snk.rn = 1
WHERE snk.price > src.price
  AND src.station_id <> snk.station_id
"""


def compute_top_routes(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM top_routes_per_ware")
    conn.execute(_TOP_ROUTE_SQL)
