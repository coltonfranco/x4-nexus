"""Player P&L from the economylog tables — net-worth trajectory + transaction ledger.

`economy_money` and `economy_trade` store `[0x..]` component ids for owners/buyers/sellers.
Here we resolve those to a display identity by joining the live `stations`/`ships` rosters:
an id that matches neither is an empire/faction-level account (e.g. the player faction's
aggregate net worth), surfaced with kind='account'.

The economylog keeps both periodic net-worth *baseline* samples (`type IS NULL`) and
individual money *events* (type = trade/transfer/orderqueue_*). The net-worth curve is the
baseline series; the ledger is `economy_trade`.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

# Resolve one id column (joined as st = stations, sh = ships) to display name/kind/faction.
# Procedural assets carry an empty name, so fall back name → code; a non-asset id stays NULL
# here and the caller substitutes the raw id.
_RESOLVE = """
    COALESCE(NULLIF({st}.name,''), NULLIF({st}.code,''),
             NULLIF({sh}.name,''), NULLIF({sh}.code,'')) AS {p}_name,
    COALESCE({st}.owner_faction, {sh}.owner_faction)      AS {p}_faction,
    CASE WHEN {st}.station_id IS NOT NULL THEN 'station'
         WHEN {sh}.ship_id    IS NOT NULL THEN 'ship'
         ELSE 'account' END                               AS {p}_kind,
    COALESCE({st}.is_player_owned, {sh}.is_player_owned, 0) AS {p}_is_player
"""

@dataclass(slots=True)
class Account:
    owner: str
    name: str | None
    kind: str                  # station | ship | account
    faction: str | None
    is_player: bool
    net_worth: int | None      # latest baseline `v` (faction-level; NULL for most stations)
    net_worth_assets: int | None  # latest baseline `v2`
    live_cash: int | None      # exact cash balance from latest transaction event
    account_amount: int | None  # station's own credits (from station_overview; NULL for non-stations)
    account_min: int | None    # operating budget lower threshold
    account_max: int | None    # operating budget upper threshold (manager target)
    latest_time: float | None
    event_count: int


@dataclass(slots=True)
class NetWorthPoint:
    owner: str
    name: str | None
    is_player: bool
    time: float
    v: int | None
    v2: int | None
    type: str | None              # event reason (trade/transfer/orderqueue_*/NULL baseline)
    delta: int | None             # change in v from the previous point (null for first)
    partner: str | None           # counterparty raw component id (for linking)
    partner_name: str | None      # resolved station/ship name
    partner_faction: str | None   # resolved faction id (for linking)
    partner_faction_name: str | None  # resolved faction display name
    partner_kind: str | None      # station | ship | account
    partner_is_player: bool       # whether the counterparty is player-owned


@dataclass(slots=True)
class WarePnl:
    ware: str | None
    ware_name: str | None
    icon_path: str | None
    tags: str | None
    income: int       # credits the player earned selling this ware
    spend: int        # credits the player spent buying it
    net: int          # income - spend
    sell_count: int
    buy_count: int


@dataclass(slots=True)
class TradeRecord:
    time: float
    ware: str | None
    ware_name: str | None
    price: int | None
    quantity: int | None
    buyer: str | None
    buyer_name: str | None
    buyer_is_player: bool
    seller: str | None
    seller_name: str | None
    seller_is_player: bool


@dataclass(slots=True)
class NetWorthBreakdown:
    cash: int
    station_accounts: int
    ship_hulls: int
    ship_equipment: int
    station_modules: int
    inventory: int
    total: int



_ACCOUNTS_QUERY = f"""
WITH baseline AS (
    SELECT owner, time, v, v2,
           ROW_NUMBER() OVER (PARTITION BY owner ORDER BY time DESC) AS rn
    FROM economy_money WHERE type IS NULL
),
live_cash AS (
    SELECT owner, v / 100 AS cash,
           ROW_NUMBER() OVER (PARTITION BY owner ORDER BY time DESC) AS rn
    FROM economy_money WHERE type IS NOT NULL
),
counts AS (
    SELECT owner, COUNT(*) AS n, MAX(time) AS last_time FROM economy_money GROUP BY owner
)
SELECT c.owner, b.v / 100 AS v, b.v2 / 100 AS v2, l.cash AS live_cash, b.time AS latest_time, c.n AS event_count,
       ov.account_amount, ov.account_min, ov.account_max,
       {_RESOLVE.format(st="st", sh="sh", p="owner")}
FROM counts c
LEFT JOIN baseline b ON b.owner = c.owner AND b.rn = 1
LEFT JOIN live_cash l ON l.owner = c.owner AND l.rn = 1
LEFT JOIN stations st ON st.station_id = c.owner
LEFT JOIN ships    sh ON sh.ship_id    = c.owner
LEFT JOIN station_overview ov ON ov.station_id = c.owner
ORDER BY COALESCE(ov.account_amount, b.v / 100) DESC NULLS LAST, c.owner
"""


def _ensure_account_columns(conn: sqlite3.Connection) -> None:
    """Add account_min/account_max to station_overview if they don't exist yet.

    The canonical migration lives in schema_dynamic.sql, but a hot-reloaded
    API process may connect to a DB that was created before the schema file
    was updated (the .sql file doesn't trigger a uvicorn reload).  This
    guard runs on every accounts() call — cheap (PRAGMA table_info is a
    no-IO catalog read) and idempotent.
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info('station_overview')").fetchall()}
    if "account_min" not in cols:
        conn.execute("ALTER TABLE station_overview ADD COLUMN account_min INTEGER")
    if "account_max" not in cols:
        conn.execute("ALTER TABLE station_overview ADD COLUMN account_max INTEGER")


def accounts(conn: sqlite3.Connection, *, player_only: bool = False) -> list[Account]:
    """One row per tracked money owner with its latest net worth and, for stations,
    the real account balance + operating budget from station_overview."""
    _ensure_account_columns(conn)
    out = [
        Account(
            owner=r["owner"],
            name=r["owner_name"] or r["owner"],
            kind=r["owner_kind"],
            faction=r["owner_faction"],
            is_player=bool(r["owner_is_player"]),
            net_worth=r["v"],
            net_worth_assets=r["v2"],
            live_cash=r["live_cash"],
            account_amount=r["account_amount"],
            account_min=r["account_min"],
            account_max=r["account_max"],
            latest_time=r["latest_time"],
            event_count=r["event_count"],
        )
        for r in conn.execute(_ACCOUNTS_QUERY).fetchall()
    ]
    if player_only:
        # The player faction aggregate account uses the same component id as
        # player.player_id (e.g. [0x21f9893]).  It doesn't match any station or
        # ship row, so is_player resolves to 0 — but it IS the global credit
        # account.  Resolve the player's real id from the player table.
        prow = conn.execute("SELECT player_id FROM player WHERE id = 1").fetchone()
        player_owner = prow["player_id"] if prow else None
        result: list[Account] = []
        for a in out:
            if a.is_player:
                result.append(a)
            elif player_owner and a.owner == player_owner and a.kind == "account":
                a.is_player = True
                result.append(a)
        return result
    return out


_NETWORTH_QUERY = f"""
SELECT m.owner, m.time, m.type, m.v, m.v2, m.partner,
       {_RESOLVE.format(st="st", sh="sh", p="owner")},
       {_RESOLVE.format(st="pst", sh="psh", p="partner")},
       pf.name AS partner_faction_name
FROM economy_money m
LEFT JOIN stations st  ON st.station_id  = m.owner
LEFT JOIN ships    sh  ON sh.ship_id     = m.owner
LEFT JOIN stations pst ON pst.station_id = m.partner
LEFT JOIN ships    psh ON psh.ship_id    = m.partner
LEFT JOIN s.factions pf ON pf.faction_id = COALESCE(pst.owner_faction, psh.owner_faction)
WHERE 1=1 {{owner_filter}}
ORDER BY m.owner, m.time
"""


def net_worth_series(
    conn: sqlite3.Connection, *, owner: str | None = None, player_only: bool = True
) -> list[NetWorthPoint]:
    """Net-worth trajectory from every economylog data point.

    Every row in economy_money carries an absolute running balance in `v` —
    baselines (type IS NULL) and events (trade/transfer/orderqueue_*) alike.
    The delta is computed point-to-point as the change in `v` since the
    previous row for the same owner.  The in-game economy graph shows every
    data point this way.
    """
    params: list[object] = []
    clause = ""
    if owner is not None:
        clause = "AND m.owner = ?"
        params.append(owner)
    rows = conn.execute(_NETWORTH_QUERY.format(owner_filter=clause), params).fetchall()

    # Group by owner; within each group, rows are already ordered by time.
    from collections import defaultdict
    groups: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        groups[r["owner"]].append(r)

    out: list[NetWorthPoint] = []
    for _owner, group in groups.items():
        prev_v: int | None = None
        is_player = False
        owner_name: str | None = None
        for r in group:
            if r["v"] is None:
                continue  # no value to chart
            is_player = is_player or bool(r["owner_is_player"])
            owner_name = r["owner_name"] or r["owner"]
            cur_v: int = r["v"] // 100  # economy_money stores centi-credits
            cur_v2: int | None = r["v2"] // 100 if r["v2"] is not None else None
            delta = (cur_v - prev_v) if prev_v is not None else None
            # Partner fields are only meaningful when a counterparty exists.
            has_partner = r["partner"] is not None
            out.append(
                NetWorthPoint(
                    owner=r["owner"],
                    name=owner_name,
                    is_player=is_player,
                    time=r["time"],
                    v=cur_v,
                    v2=cur_v2,
                    type=r["type"],
                    delta=delta,
                    partner=r["partner"],
                    partner_name=(r["partner_name"] or r["partner"]) if has_partner else None,
                    partner_faction=r["partner_faction"] if has_partner else None,
                    partner_faction_name=r["partner_faction_name"] if has_partner else None,
                    partner_kind=r["partner_kind"] if has_partner else None,
                    partner_is_player=bool(r["partner_is_player"]) if has_partner else False,
                )
            )
            prev_v = cur_v

    if player_only and owner is None:
        prow = conn.execute("SELECT player_id FROM player WHERE id = 1").fetchone()
        player_owner = prow["player_id"] if prow else None
        return [p for p in out if p.is_player or (player_owner and p.owner == player_owner)]
    return out


def net_worth_breakdown(conn: sqlite3.Connection) -> NetWorthBreakdown:
    """Calculates the exact breakdown of the player's net worth matching the game UI.
    Requires `s.*` to be attached (handled automatically by the API middleware).
    """
    # Cash
    cash_res = conn.execute("SELECT credits FROM player WHERE id = 1").fetchone()
    cash = cash_res["credits"] if cash_res else 0

    # Station Accounts
    acc_res = conn.execute(
        "SELECT SUM(account_amount) FROM station_overview ov "
        "JOIN stations st ON st.station_id = ov.station_id WHERE st.is_player_owned = 1"
    ).fetchone()
    station_accounts = acc_res[0] or 0

    # Ship Hulls
    hull_res = conn.execute(
        "SELECT SUM(w.price_avg) FROM ships sh "
        "JOIN s.wares w ON w.component_ref = sh.macro "
        "WHERE sh.is_player_owned = 1"
    ).fetchone()
    ship_hulls = hull_res[0] or 0

    # Ship Equipment
    eq_res = conn.execute(
        "SELECT SUM(w.price_avg * COALESCE(sl.ammunition, 1)) FROM ship_loadouts sl "
        "JOIN ships sh ON sh.ship_id = sl.ship_id "
        "JOIN s.wares w ON w.component_ref = sl.macro "
        "WHERE sh.is_player_owned = 1"
    ).fetchone()
    ship_equipment = eq_res[0] or 0

    # Station Modules
    mod_res = conn.execute(
        "SELECT SUM(w.price_avg * sm.count) FROM station_modules sm "
        "JOIN stations st ON st.station_id = sm.station_id "
        "JOIN s.wares w ON w.component_ref = sm.macro "
        "WHERE st.is_player_owned = 1"
    ).fetchone()
    station_modules = mod_res[0] or 0

    # Inventory
    inv_res = conn.execute(
        "SELECT SUM(w.price_avg * i.amount) FROM player_inventory i "
        "JOIN s.wares w ON w.ware_id = i.ware_id"
    ).fetchone()
    inventory = inv_res[0] or 0

    # Ship Cargo (some saves might count this under inventory/assets, but typically inventory is personal)
    # The game calculates 'Inventory' as just player inventory.

    return NetWorthBreakdown(
        cash=cash,
        station_accounts=station_accounts,
        ship_hulls=ship_hulls,
        ship_equipment=ship_equipment,
        station_modules=station_modules,
        inventory=inventory,
        total=cash + station_accounts + ship_hulls + ship_equipment + station_modules + inventory,
    )


_PNL_QUERY = """
WITH t AS (
    SELECT et.ware, (et.price * et.v) / 100 AS value,
           COALESCE(bst.is_player_owned, bsh.is_player_owned, 0) AS buyer_player,
           COALESCE(sst.is_player_owned, ssh.is_player_owned, 0) AS seller_player
    FROM economy_trade et
    LEFT JOIN stations bst ON bst.station_id = et.buyer
    LEFT JOIN ships    bsh ON bsh.ship_id    = et.buyer
    LEFT JOIN stations sst ON sst.station_id = et.seller
    LEFT JOIN ships    ssh ON ssh.ship_id    = et.seller
    WHERE et.price IS NOT NULL AND et.v IS NOT NULL
)
-- External P&L only: a player→player trade is an internal transfer, not profit/loss, so
-- income requires a non-player buyer and spend a non-player seller. Internal transfers fall
-- out of both sums (they'd otherwise inflate income and spend by the same amount).
SELECT t.ware, w.name AS ware_name, w.icon_path, w.tags,
       SUM(CASE WHEN t.seller_player = 1 AND t.buyer_player  = 0 THEN t.value ELSE 0 END) AS income,
       SUM(CASE WHEN t.buyer_player  = 1 AND t.seller_player = 0 THEN t.value ELSE 0 END) AS spend,
       SUM(CASE WHEN t.seller_player = 1 AND t.buyer_player  = 0 THEN 1 ELSE 0 END) AS sell_count,
       SUM(CASE WHEN t.buyer_player  = 1 AND t.seller_player = 0 THEN 1 ELSE 0 END) AS buy_count
FROM t
LEFT JOIN s.wares w ON w.ware_id = t.ware
WHERE t.buyer_player = 1 OR t.seller_player = 1
GROUP BY t.ware
HAVING income > 0 OR spend > 0
ORDER BY (income - spend) DESC
"""


def ware_pnl(conn: sqlite3.Connection) -> list[WarePnl]:
    """Per-ware profit/loss from the player's trades — the income vs cost breakdown that
    answers 'which commodities make me money?'. Ordered most-profitable first."""
    return [
        WarePnl(
            ware=r["ware"],
            ware_name=r["ware_name"],
            icon_path=r["icon_path"],
            tags=r["tags"],
            income=int(r["income"] or 0),
            spend=int(r["spend"] or 0),
            net=int((r["income"] or 0) - (r["spend"] or 0)),
            sell_count=r["sell_count"] or 0,
            buy_count=r["buy_count"] or 0,
        )
        for r in conn.execute(_PNL_QUERY).fetchall()
    ]


_TRADES_QUERY = f"""
SELECT t.time, t.ware, w.name AS ware_name, t.price / 100 AS price, t.v AS quantity,
       t.buyer, t.seller,
       {_RESOLVE.format(st="bst", sh="bsh", p="buyer")},
       {_RESOLVE.format(st="sst", sh="ssh", p="seller")}
FROM economy_trade t
LEFT JOIN s.wares  w   ON w.ware_id    = t.ware
LEFT JOIN stations bst ON bst.station_id = t.buyer
LEFT JOIN ships    bsh ON bsh.ship_id    = t.buyer
LEFT JOIN stations sst ON sst.station_id = t.seller
LEFT JOIN ships    ssh ON ssh.ship_id    = t.seller
WHERE 1=1 {{filters}}
ORDER BY t.time DESC
LIMIT ? OFFSET ?
"""


def trades(
    conn: sqlite3.Connection,
    *,
    ware: str | None = None,
    owner: str | None = None,
    player_only: bool = False,
    limit: int = 500,
    offset: int = 0,
) -> list[TradeRecord]:
    """Transaction ledger, most recent first. `owner` matches buyer OR seller; `player_only`
    keeps trades where either party is a player asset."""
    filters = ""
    params: list[object] = []
    if ware is not None:
        filters += " AND t.ware = ?"
        params.append(ware)
    if owner is not None:
        filters += " AND (t.buyer = ? OR t.seller = ?)"
        params += [owner, owner]
    if player_only:
        filters += (
            " AND (COALESCE(bst.is_player_owned, bsh.is_player_owned, 0) = 1"
            " OR COALESCE(sst.is_player_owned, ssh.is_player_owned, 0) = 1)"
        )
    params += [limit, offset]
    return [
        TradeRecord(
            time=r["time"],
            ware=r["ware"],
            ware_name=r["ware_name"],
            price=r["price"],
            quantity=r["quantity"],
            buyer=r["buyer"],
            buyer_name=r["buyer_name"] or r["buyer"],
            buyer_is_player=bool(r["buyer_is_player"]),
            seller=r["seller"],
            seller_name=r["seller_name"] or r["seller"],
            seller_is_player=bool(r["seller_is_player"]),
        )
        for r in conn.execute(_TRADES_QUERY.format(filters=filters), params).fetchall()
    ]
