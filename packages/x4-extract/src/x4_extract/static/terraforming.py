"""Extract terraforming data from `libraries/terraforming.xml`."""

from __future__ import annotations

import sqlite3
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_float as _float
from x4_extract.parsing import xml_attr_int_or_none as _int


@dataclass(slots=True)
class ExtractResult:
    stats: list[dict[str, Any]] = field(default_factory=list)
    project_groups: list[dict[str, Any]] = field(default_factory=list)
    projects: list[dict[str, Any]] = field(default_factory=list)
    effects: list[dict[str, Any]] = field(default_factory=list)
    resources: list[dict[str, Any]] = field(default_factory=list)
    deliveries: list[dict[str, Any]] = field(default_factory=list)
    conditions: list[dict[str, Any]] = field(default_factory=list)
    sideeffects: list[dict[str, Any]] = field(default_factory=list)
    rebates: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    """Parse terraforming.xml into row dicts. Pure function — no I/O."""
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    for stat_el in root.iterfind("stats/stat"):
        stat_id = stat_el.get("id")
        if not stat_id:
            continue
        default_raw = stat_el.get("default")
        out.stats.append(
            {
                "stat_id": stat_id,
                "name": stat_el.get("name"),
                "icon": stat_el.get("icon"),
                "default_val": int(default_raw) if default_raw and default_raw.isdigit() else None,
            }
        )

    for pg_el in root.iterfind("projectgroups/projectgroup"):
        group_id = pg_el.get("id")
        if not group_id:
            continue
        out.project_groups.append(
            {
                "group_id": group_id,
                "name": pg_el.get("name"),
            }
        )

    for proj_el in root.iterfind("projects/project"):
        project_id = proj_el.get("id")
        if not project_id:
            continue

        duration_raw = proj_el.get("duration")
        cooldown_raw = proj_el.get("repeatcooldown")
        resilient_raw = proj_el.get("resilient")
        chance_raw = proj_el.get("chance")

        resources_el = proj_el.find("resources")
        price_raw = resources_el.get("price") if resources_el is not None else None
        maxprice_raw = resources_el.get("maxprice") if resources_el is not None else None
        payout_raw = resources_el.get("payout") if resources_el is not None else None
        pricescale_raw = resources_el.get("pricescale") if resources_el is not None else None

        out.projects.append(
            {
                "project_id": project_id,
                "group_id": proj_el.get("group"),
                "name": proj_el.get("name"),
                "description": proj_el.get("description"),
                "duration": int(duration_raw) if duration_raw and duration_raw.isdigit() else None,
                "repeat_cooldown": int(cooldown_raw)
                if cooldown_raw and cooldown_raw.isdigit()
                else None,
                "resilient": 1 if resilient_raw == "true" else 0,
                "chance": float(chance_raw) if chance_raw else None,
                "resource_credits": int(price_raw) if price_raw and price_raw.isdigit() else None,
                "resource_maxprice": int(maxprice_raw)
                if maxprice_raw and maxprice_raw.isdigit()
                else None,
                "resource_payout": int(payout_raw) if payout_raw and payout_raw.isdigit() else None,
                "resource_pricescale": int(pricescale_raw)
                if pricescale_raw and pricescale_raw.isdigit()
                else None,
                "research": proj_el.get("research"),
                "showalways": 1 if proj_el.get("showalways") == "true" else 0,
                "version": _int(proj_el, "version"),
            }
        )

        for effect_el in proj_el.iterfind("effects/effect"):
            stat = effect_el.get("stat")
            change_raw = effect_el.get("change")
            min_raw = effect_el.get("min")
            max_raw = effect_el.get("max")
            value_raw = effect_el.get("value")
            if stat and change_raw is not None:
                with suppress(ValueError):
                    out.effects.append(
                        {
                            "project_id": project_id,
                            "stat": stat,
                            "change": int(change_raw),
                            "min_val": int(min_raw) if min_raw else None,
                            "max_val": int(max_raw) if max_raw else None,
                            "value": int(value_raw) if value_raw else None,
                        }
                    )

        if resources_el is not None:
            for ware_el in resources_el.iterfind("ware"):
                ware_id = ware_el.get("ware")
                amount_raw = ware_el.get("amount")
                if ware_id and amount_raw:
                    with suppress(ValueError):
                        out.resources.append(
                            {
                                "project_id": project_id,
                                "ware_id": ware_id,
                                "amount": int(amount_raw),
                            }
                        )

        deliveries_el = proj_el.find("deliveries")
        if deliveries_el is not None:
            for ship_el in deliveries_el.iterfind("ship"):
                macro = ship_el.get("macro")
                amount_raw = ship_el.get("amount")
                build_raw = ship_el.get("buildduration")
                if macro and amount_raw:
                    with suppress(ValueError):
                        out.deliveries.append(
                            {
                                "project_id": project_id,
                                "ship_macro": macro,
                                "amount": int(amount_raw),
                                "build_duration": int(build_raw) if build_raw else None,
                            }
                        )

        for cond_el in proj_el.iterfind("conditions/condition"):
            stat = cond_el.get("stat")
            if not stat:
                continue
            min_raw = cond_el.get("min")
            max_raw = cond_el.get("max")
            minval_raw = cond_el.get("minvalue")
            maxval_raw = cond_el.get("maxvalue")
            out.conditions.append(
                {
                    "project_id": project_id,
                    "stat": stat,
                    "min_val": float(min_raw) if min_raw else None,
                    "max_val": float(max_raw) if max_raw else None,
                    "min_value": int(minval_raw) if minval_raw else None,
                    "max_value": int(maxval_raw) if maxval_raw else None,
                }
            )

        for se_el in proj_el.iterfind("sideeffects/sideeffect"):
            se_stat = se_el.get("stat")
            if not se_stat:
                continue
            out.sideeffects.append(
                {
                    "project_id": project_id,
                    "stat": se_stat,
                    "change": _float(se_el, "change"),
                    "beneficial": 1 if se_el.get("beneficial") == "true" else 0,
                    "chance": _float(se_el, "chance"),
                    "setback": se_el.get("setback"),
                    "triggered_project": se_el.get("project"),
                    "text": se_el.get("text"),
                }
            )

        for rebate_el in proj_el.iterfind("rebates/rebate"):
            out.rebates.append(
                {
                    "project_id": project_id,
                    "ware_id": rebate_el.get("ware"),
                    "ware_group": rebate_el.get("waregroup"),
                    "value": _float(rebate_el, "value"),
                }
            )

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM terraform_rebates")
    conn.execute("DELETE FROM terraform_sideeffects")
    conn.execute("DELETE FROM terraform_project_conditions")
    conn.execute("DELETE FROM terraform_project_deliveries")
    conn.execute("DELETE FROM terraform_project_resources")
    conn.execute("DELETE FROM terraform_project_effects")
    conn.execute("DELETE FROM terraform_projects")
    conn.execute("DELETE FROM terraform_project_groups")
    conn.execute("DELETE FROM terraform_stats")

    conn.executemany(
        "INSERT INTO terraform_stats (stat_id, name, icon, default_val) "
        "VALUES (:stat_id, :name, :icon, :default_val)",
        result.stats,
    )
    conn.executemany(
        "INSERT INTO terraform_project_groups (group_id, name) VALUES (:group_id, :name)",
        result.project_groups,
    )
    conn.executemany(
        """INSERT INTO terraform_projects
            (project_id, group_id, name, description, duration, repeat_cooldown, resilient, chance,
             resource_credits, resource_maxprice, resource_payout, resource_pricescale,
             research, showalways, version)
           VALUES
            (:project_id, :group_id, :name, :description, :duration, :repeat_cooldown, :resilient, :chance,
             :resource_credits, :resource_maxprice, :resource_payout, :resource_pricescale,
             :research, :showalways, :version)""",
        result.projects,
    )
    conn.executemany(
        "INSERT INTO terraform_project_effects (project_id, stat, change, min_val, max_val, value) "
        "VALUES (:project_id, :stat, :change, :min_val, :max_val, :value)",
        result.effects,
    )
    conn.executemany(
        "INSERT INTO terraform_project_resources (project_id, ware_id, amount) "
        "VALUES (:project_id, :ware_id, :amount)",
        result.resources,
    )
    conn.executemany(
        "INSERT INTO terraform_project_deliveries (project_id, ship_macro, amount, build_duration) "
        "VALUES (:project_id, :ship_macro, :amount, :build_duration)",
        result.deliveries,
    )
    conn.executemany(
        "INSERT INTO terraform_project_conditions (project_id, stat, min_val, max_val, min_value, max_value) "
        "VALUES (:project_id, :stat, :min_val, :max_val, :min_value, :max_value)",
        result.conditions,
    )
    if result.sideeffects:
        conn.executemany(
            "INSERT INTO terraform_sideeffects (project_id, stat, change, beneficial, chance, setback, triggered_project, text) "
            "VALUES (:project_id, :stat, :change, :beneficial, :chance, :setback, :triggered_project, :text)",
            result.sideeffects,
        )
    if result.rebates:
        conn.executemany(
            "INSERT INTO terraform_rebates (project_id, ware_id, ware_group, value) "
            "VALUES (:project_id, :ware_id, :ware_group, :value)",
            result.rebates,
        )
