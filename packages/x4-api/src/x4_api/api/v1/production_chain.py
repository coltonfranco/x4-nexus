"""Production-chain graph endpoint — the whole commodity economy in one payload.

Powers the dashboard's Production Chains view: every economy commodity as a node placed in
a production-complexity column (`depth`), every recipe as edges, plus two live overlays —
galaxy *market demand* (from station offers) and the player's own *empire balance* (from
station modules x static recipes). The client switches recipe method / overlay without
refetching, so everything ships together.

Static-only fields (recipes, prices, depth) populate as soon as `rebuild-static` has run;
market/empire fields are null until a save is ingested.
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from x4_api.api.deps import get_db
from x4_api.api.icons import get_ware_icon_url
from x4_api.api.schemas import PublicModel
from x4_api.domain.empire_balance import empire_flows
from x4_api.domain.supply import ware_market
from x4_api.domain.ware_class import CATEGORY_SQL

router = APIRouter()


class ChainInput(PublicModel):
    ware_id: str
    amount: int


class ChainRecipe(PublicModel):
    method: str
    time_sec: float
    amount: int
    workforce: int | None
    inputs: list[ChainInput]


class ProducerModule(PublicModel):
    """A station production module that makes this ware (static catalog)."""

    module_id: str
    name: str | None
    makerrace: str | None
    production_method: str | None = None


class ProductionChainNode(PublicModel):
    ware_id: str
    name: str
    group_id: str | None
    category: str
    group_tier: int | None
    depth: int  # production complexity column: 0 = raw, N = furthest from raw
    price_min: int | None
    price_avg: int | None
    price_max: int | None
    icon_url: str | None
    # Live market (galaxy trade offers) — null without a save.
    market_avg: int | None = None
    sell_qty: int | None = None
    buy_qty: int | None = None
    net_demand: int | None = None
    # Player empire steady-state estimate (per hour) — null without producing stations.
    empire_production: float | None = None
    empire_consumption: float | None = None
    recipes: dict[str, ChainRecipe]
    producer_modules: list[ProducerModule]


class ProductionChainResponse(PublicModel):
    nodes: list[ProductionChainNode]
    methods: list[str]  # union of recipe methods present, drives the toggle
    has_market: bool
    has_empire: bool


@router.get("/economy/production-chain", response_model=ProductionChainResponse)
def production_chain(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ProductionChainResponse:
    """Full commodity production graph with recipe + live overlay data in one payload."""
    # CATEGORY_SQL references bare group_id/tags, so it can't share a SELECT with a
    # ware_groups join (ambiguous columns) — tiers are looked up separately.
    ware_rows = conn.execute(
        f"""
        SELECT w.ware_id, w.name, w.group_id, ({CATEGORY_SQL}) AS category,
               w.tier, w.price_min, w.price_avg, w.price_max, w.tags, w.icon_path
        FROM s.wares w
        WHERE ({CATEGORY_SQL}) = 'commodity' AND w.name NOT LIKE '(TEMP)%'
        ORDER BY w.ware_id
        """
    ).fetchall()
    node_ids = {r["ware_id"] for r in ware_rows}
    group_tiers = {
        r["group_id"]: r["tier"]
        for r in conn.execute("SELECT group_id, tier FROM s.ware_groups")
    }

    # Recipes for the node set (all methods); inputs kept whole so the page can show them,
    # the client draws edges only between known nodes.
    prod_rows = conn.execute(
        "SELECT ware_id, method, time_sec, amount, workforce FROM s.ware_production"
    ).fetchall()
    input_rows = conn.execute(
        "SELECT ware_id, method, input_ware_id, amount FROM s.ware_inputs"
    ).fetchall()

    inputs_by_key: dict[tuple[str, str], list[ChainInput]] = {}
    for r in input_rows:
        if r["ware_id"] not in node_ids:
            continue
        inputs_by_key.setdefault((r["ware_id"], r["method"]), []).append(
            ChainInput(ware_id=r["input_ware_id"], amount=r["amount"])
        )

    recipes_by_ware: dict[str, dict[str, ChainRecipe]] = {}
    methods: set[str] = set()
    for r in prod_rows:
        ware = r["ware_id"]
        if ware not in node_ids:
            continue
        methods.add(r["method"])
        recipes_by_ware.setdefault(ware, {})[r["method"]] = ChainRecipe(
            method=r["method"],
            time_sec=r["time_sec"],
            amount=r["amount"],
            workforce=r["workforce"],
            inputs=inputs_by_key.get((ware, r["method"]), []),
        )

    # Production modules that make each ware (which station modules you'd build).
    # Note: Some modules (like recyclers) use `wares="..."` instead of `ware="..."` in the XML,
    # so the extractor missed them. We inject them here until the DB is rebuilt.
    RECYCLER_MODULES = {
        "prod_gen_scrap_recycler_macro": ["hullparts", "claytronics"],
        "prod_ter_scrap_recycler_macro": ["computronicsubstrate", "siliconcarbide"],
        "prod_gen_scrap_recyclerkhaak_macro": ["khaakalloy"],
    }
    
    modules_by_ware: dict[str, list[ProducerModule]] = {}
    for r in conn.execute(
        "SELECT module_id, name, makerrace, produces_ware_id, production_method FROM s.modules"
        " WHERE kind IN ('production', 'processingmodule')"
        " ORDER BY makerrace IS NOT NULL, name"
    ):
        wares = []
        if r["produces_ware_id"]:
            wares.append(r["produces_ware_id"])
        if r["module_id"] in RECYCLER_MODULES:
            wares.extend(RECYCLER_MODULES[r["module_id"]])
            
        for w in wares:
            if w in node_ids:
                modules_by_ware.setdefault(w, []).append(
                    ProducerModule(
                        module_id=r["module_id"], name=r["name"], makerrace=r["makerrace"], production_method=r["production_method"]
                    )
                )

    # Live overlays.
    market = {m.ware_id: m for m in ware_market(conn)}
    empire = empire_flows(conn)

    nodes: list[ProductionChainNode] = []
    for r in ware_rows:
        ware = r["ware_id"]
        m = market.get(ware)
        e = empire.get(ware)
        nodes.append(
            ProductionChainNode(
                ware_id=ware,
                name=r["name"],
                group_id=r["group_id"],
                category=r["category"],
                group_tier=group_tiers.get(r["group_id"]),
                # Column = production tier (1 = raw) shifted to a 0-based index.
                depth=(r["tier"] or 1) - 1,
                price_min=r["price_min"],
                price_avg=r["price_avg"],
                price_max=r["price_max"],
                icon_url=get_ware_icon_url(ware, r["icon_path"], r["tags"]),
                market_avg=m.avg_price if m else None,
                sell_qty=m.sell_qty if m else None,
                buy_qty=m.buy_qty if m else None,
                net_demand=m.net_demand if m else None,
                empire_production=round(e[0], 1) if e else None,
                empire_consumption=round(e[1], 1) if e else None,
                recipes=recipes_by_ware.get(ware, {}),
                producer_modules=modules_by_ware.get(ware, []),
            )
        )

    return ProductionChainResponse(
        nodes=nodes,
        methods=sorted(methods),
        has_market=bool(market),
        has_empire=bool(empire),
    )
