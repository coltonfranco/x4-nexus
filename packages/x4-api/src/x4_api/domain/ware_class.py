"""Ware catalog classification.

The raw `wares` table mixes four very different things behind one flat list:
tradable economy commodities, buyable ship equipment, inventory/crafting/mission
items, and ship blueprints. The dashboard surfaces these on separate pages, so the
bucket each ware belongs to is computed here once and reused by every endpoint.

`transport` is the primary signal; `group_id` overrides it for a few equipment
families (notably drones, which are technically ship macros but bought as parts).
The four buckets are exhaustive — every ware lands in exactly one.
"""

from __future__ import annotations

import re

# Bucket assignment as a SQL CASE expression over a `wares` row. Kept as SQL (not
# Python) so endpoints can filter/aggregate by category without materializing rows.
# Order matters: the group_id override must precede the transport='ship' check so
# buyable drones land in `equipment` rather than `ship`.
CATEGORY_SQL = """
CASE
  WHEN group_id IN ('engines','shields','weapons','turrets','thrusters',
                    'missiles','drones','countermeasures') THEN 'equipment'
  WHEN transport IN ('equipment','software') THEN 'equipment'
  WHEN transport = 'ship' THEN 'ship'
  WHEN transport IN ('container','solid','liquid','condensate','gases') THEN 'commodity'
  ELSE 'inventory'
END
""".strip()

CATEGORIES = ("commodity", "equipment", "inventory", "ship")

# group_id → equipment kind. Authoritative when present.
_GROUP_KIND = {
    "engines": "engine",
    "shields": "shield",
    "weapons": "weapon",
    "turrets": "turret",
    "thrusters": "thruster",
    "missiles": "missile",
    "drones": "drone",
    "software": "software",
    "countermeasures": "countermeasure",
}

# Equipment kinds that may appear as the second token of a ware's `tags` when it has
# no group_id (satellites, probes, nav beacons, laser towers, loose weapons, …).
_TAG_KINDS = frozenset(
    {
        "satellite",
        "resourceprobe",
        "navbeacon",
        "lasertower",
        "mine",
        "weapon",
        "turret",
        "shield",
        "engine",
        "thruster",
        "missile",
        "software",
    }
)

# Equipment ware ids generally read `{kind}_{faction}_{size}_{variant}_{nn}_mkN`.
# Faction is a 2-3 letter race code, size one of xs/s/m/l/xl. Best-effort: missiles,
# software, and deployables don't follow it and simply yield None.
_META_RE = re.compile(r"^[a-z]+_(?P<faction>[a-z]{2,3})_(?P<size>xs|s|m|l|xl)_")
_MK_RE = re.compile(r"_mk(?P<mk>\d+)")

# equipment kind → (stat table, primary-key column). Wares join via ware_id||'_macro'.
EQUIP_STAT_TABLE = {
    "engine": ("equip_engines", "engine_id"),
    "shield": ("equip_shields", "shield_id"),
    "weapon": ("equip_weapons", "weapon_id"),
    "turret": ("equip_weapons", "weapon_id"),
}


def equipment_kind(group_id: str | None, tags: str | None) -> str:
    """Classify a piece of equipment into a concrete kind (engine, turret, …)."""
    if group_id in _GROUP_KIND:
        return _GROUP_KIND[group_id]
    for token in (tags or "").split():
        if token in _TAG_KINDS:
            return token
    return "other"


def equipment_meta(ware_id: str) -> tuple[str | None, str | None, int | None]:
    """Parse (faction, size, mk) from an equipment ware id. Any may be None."""
    faction: str | None = None
    size: str | None = None
    if (m := _META_RE.match(ware_id)) is not None:
        faction, size = m.group("faction"), m.group("size")
    mk = int(mm.group("mk")) if (mm := _MK_RE.search(ware_id)) else None
    return faction, size, mk
