"""Empire production/consumption flows — what the player's own factories make and burn.

The save records, per player station, the modules installed (`station_modules.count`) but
NOT a live per-hour throughput. We reconstruct the steady-state rate from static recipes:
each production module's `produces_ware_id` maps to a `s.ware_production` recipe whose
`amount / time_sec` is the per-second output; x3600xmodule-count gives the empire's hourly
production, and the recipe's `s.ware_inputs` give the matching consumption.

Approximations (documented intentionally, see plan):
- The `default` recipe method is assumed. The save doesn't persist which faction method a
  module runs, and `default` is the canonical rate for all but a handful of wares.
- FULL workforce / 100% uptime is assumed (max throughput). Real output scales with
  `station_overview.workforce_bonus`; folding that in is a future refinement.

Empty when the player owns no producing stations (or no save is loaded) — callers treat an
empty mapping as "no empire data" and disable the empire overlay.
"""

from __future__ import annotations

import sqlite3

# Player production modules → the ware each one makes, aggregated to a module count.
_MODULES_QUERY = """
SELECT m.produces_ware_id AS ware_id, SUM(sm.count) AS modules
FROM stations st
JOIN station_modules sm ON sm.station_id = st.station_id
JOIN s.modules m ON m.module_id = sm.module_id
WHERE st.is_player_owned = 1 AND m.produces_ware_id IS NOT NULL
GROUP BY m.produces_ware_id
"""

_HOUR = 3600.0


def empire_flows(conn: sqlite3.Connection) -> dict[str, tuple[float, float]]:
    """Return {ware_id: (production_per_h, consumption_per_h)} across player stations.

    Both rates are hourly steady-state estimates from static `default` recipes scaled by
    installed module counts. A ware can appear as a pure consumer (only burned by some other
    module's recipe), so production/consumption are tracked independently.
    """
    try:
        module_rows = conn.execute(_MODULES_QUERY).fetchall()
    except sqlite3.Error:
        # Dynamic tables (stations/station_modules) absent — no save attached.
        return {}

    counts = {r["ware_id"]: r["modules"] or 0 for r in module_rows if r["ware_id"]}
    if not counts:
        return {}

    # Static default recipe per produced ware: output rate + input rates.
    placeholders = ",".join("?" for _ in counts)
    prod_rows = conn.execute(
        f"SELECT ware_id, amount, time_sec FROM s.ware_production"
        f" WHERE method = 'default' AND ware_id IN ({placeholders})",
        list(counts),
    ).fetchall()
    input_rows = conn.execute(
        f"SELECT ware_id, input_ware_id, amount FROM s.ware_inputs"
        f" WHERE method = 'default' AND ware_id IN ({placeholders})",
        list(counts),
    ).fetchall()

    inputs_by_ware: dict[str, list[tuple[str, int]]] = {}
    for r in input_rows:
        inputs_by_ware.setdefault(r["ware_id"], []).append((r["input_ware_id"], r["amount"]))

    production: dict[str, float] = {}
    consumption: dict[str, float] = {}
    for r in prod_rows:
        ware = r["ware_id"]
        time_sec = r["time_sec"] or 0
        if time_sec <= 0:
            continue
        n = counts.get(ware, 0)
        if not n:
            continue
        cycles_per_h = _HOUR / time_sec
        production[ware] = production.get(ware, 0.0) + n * r["amount"] * cycles_per_h
        for input_ware, in_amount in inputs_by_ware.get(ware, []):
            consumption[input_ware] = (
                consumption.get(input_ware, 0.0) + n * in_amount * cycles_per_h
            )

    wares = set(production) | set(consumption)
    return {w: (production.get(w, 0.0), consumption.get(w, 0.0)) for w in wares}
