"""Extract named loadout presets from `libraries/loadouts.xml`.

A loadout assigns specific equipment macros to named slots on a ship. Loadouts are
used for game starts, tutorial ships, and NPC ship configurations. The data here
answers: "what does this ship class come equipped with out of the factory?"

Structure:
  <loadout id="..." macro="ship_...">
    <macros>
      <engine|shield|weapon|turret macro="..." path="..." optional="1"/>
    </macros>
    <virtualmacros>
      <thruster macro="..." />
    </virtualmacros>
    <software>
      <software ware="software_..." />
    </software>
    <ammunition>
      <ammunition macro="..." exact="N" optional="1"/>
    </ammunition>
  </loadout>
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

_MACRO_SLOTS = {"engine", "shield", "weapon", "turret", "missilelauncher", "bomblauncher"}


@dataclass(slots=True)
class ExtractResult:
    loadouts: list[dict[str, Any]] = field(default_factory=list)
    equipment: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    """Parse loadouts.xml bytes into loadout + equipment rows. Pure function — no I/O."""
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    for lo_el in root.iterfind("loadout"):
        loadout_id = lo_el.get("id")
        ship_macro = lo_el.get("macro")
        if not loadout_id or not ship_macro:
            continue

        out.loadouts.append({"loadout_id": loadout_id, "ship_macro": ship_macro})

        for slot_el in lo_el.iterfind("macros/*"):
            kind = slot_el.tag
            if kind not in _MACRO_SLOTS:
                continue
            macro = slot_el.get("macro")
            if not macro:
                continue
            out.equipment.append({
                "loadout_id": loadout_id,
                "slot_path": slot_el.get("path"),
                "macro": macro,
                "kind": kind,
                "optional": 1 if slot_el.get("optional") == "1" else 0,
                "quantity": None,
            })

        for thr_el in lo_el.iterfind("virtualmacros/thruster"):
            macro = thr_el.get("macro")
            if macro:
                out.equipment.append({
                    "loadout_id": loadout_id,
                    "slot_path": None,
                    "macro": macro,
                    "kind": "thruster",
                    "optional": 0,
                    "quantity": None,
                })

        for sw_el in lo_el.iterfind("software/software"):
            ware = sw_el.get("ware")
            if ware:
                out.equipment.append({
                    "loadout_id": loadout_id,
                    "slot_path": None,
                    "macro": ware,
                    "kind": "software",
                    "optional": 0,
                    "quantity": None,
                })

        for ammo_el in lo_el.iterfind("ammunition/ammunition"):
            macro = ammo_el.get("macro")
            if not macro:
                continue
            qty = ammo_el.get("exact")
            out.equipment.append({
                "loadout_id": loadout_id,
                "slot_path": None,
                "macro": macro,
                "kind": "ammunition",
                "optional": 1 if ammo_el.get("optional") == "1" else 0,
                "quantity": int(qty) if qty is not None else None,
            })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM loadout_equipment")
    conn.execute("DELETE FROM loadouts")
    if result.loadouts:
        conn.executemany(
            "INSERT INTO loadouts (loadout_id, ship_macro) VALUES (:loadout_id, :ship_macro)",
            result.loadouts,
        )
    if result.equipment:
        conn.executemany(
            "INSERT INTO loadout_equipment (loadout_id, slot_path, macro, kind, optional, quantity) "
            "VALUES (:loadout_id, :slot_path, :macro, :kind, :optional, :quantity)",
            result.equipment,
        )
