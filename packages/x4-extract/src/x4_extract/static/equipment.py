"""Extract equipment macros into equip_* tables."""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_float as _float
from x4_extract.parsing import xml_attr_int as _int
from x4_extract.static.constants import EQUIPMENT_CLASSES, dlc_from_path

# Tags that appear on every component connection and don't restrict compatibility
# Tags that appear on every component connection and don't restrict compatibility.
# We filter these OUT — what remains are the restrictive tags.
_GENERIC_TAGS = {
    "component", "world", "ship", "dock", "storage",
    "small", "medium", "large", "extralarge", "extrasmall",
    "engine", "weapon", "turret", "shield", "thruster",
    "missile", "countermeasure", "deployable", "drone",
    "launchtube",
    # Subclass / faction / role tags — not ship-exclusive
    "standard", "advanced", "small_racer",
    "spacesuit", "xenon", "khaak", "mandatory",
    # Shield component collision tags
    "hittable", "unhittable",
    # Weapon role / subclass tags
    "combat", "mining", "highpower", "default", "repair",
    "bomblauncher", "bomb",
    # Faction destroyer-class identifiers (fit multiple ships, not one)
    "arg_destroyer_01", "par_destroyer_01", "spl_destroyer_01",
    "tel_destroyer_01", "ter_destroyer_01",
}


@dataclass(slots=True)
class ExtractResult:
    engines: list[dict[str, Any]] = field(default_factory=list)
    shields: list[dict[str, Any]] = field(default_factory=list)
    weapons: list[dict[str, Any]] = field(default_factory=list)
    bullets: list[dict[str, Any]] = field(default_factory=list)
    deployables: list[dict[str, Any]] = field(default_factory=list)
    software: list[dict[str, Any]] = field(default_factory=list)


def extract(index_bytes: bytes, resolve_path: Callable[[str], bytes], resolve_name: Callable[[str], bytes]) -> ExtractResult:
    """Parse merged macros.xml, resolve equipment macros, and extract row dicts."""
    root = etree.fromstring(index_bytes)
    out = ExtractResult()

    # Pre-fetch all relevant macros to process
    for entry in root.iterfind("entry"):
        name = entry.get("name")
        if not name:
            continue

        path = entry.get("value")
        if not path:
            continue

        xml_path = path.replace("\\", "/") + ".xml"
        try:
            macro_bytes = resolve_path(xml_path)
            macro_root = etree.fromstring(macro_bytes)
            macro_el = macro_root.find("macro")
            if macro_el is None:
                continue

            class_raw = macro_el.get("class", "")
            if class_raw not in EQUIPMENT_CLASSES:
                continue

        except (KeyError, OSError, etree.XMLSyntaxError):
            continue

        _parse_equipment_macro(name, xml_path, macro_el, resolve_name, out)

    return out


def _parse_equipment_macro(macro_name: str, file_path: str, macro_el: etree._Element, resolve_name: Callable[[str], bytes], out: ExtractResult) -> None:
    class_id = macro_el.get("class", "")

    ident_el = macro_el.find("properties/identification")
    if ident_el is None and class_id not in ["bullet", "missile", "radar"]:
        pass

    name = (ident_el.get("name") if ident_el is not None else None) or macro_name
    faction_id = ident_el.get("makerrace") if ident_el is not None else None
    mk = _int(ident_el, "mk") if ident_el is not None else None

    # Determine size and restrictive tags from component connections
    size = None
    compat_tags = None
    comp_el = macro_el.find("component")
    if comp_el is not None:
        comp_ref = comp_el.get("ref")
        if comp_ref:
            try:
                comp_bytes = resolve_name(comp_ref)
                comp_root = etree.fromstring(comp_bytes)
                comp_node = comp_root.find(f".//component[@name='{comp_ref}']")
                if comp_node is not None:
                    # Look for the root connection that identifies the component
                    for conn in _xpath_elements(comp_node, ".//connection[contains(@tags, 'component')]"):
                        tags = conn.get("tags", "").split()
                        if "extralarge" in tags:
                            size = "xl"
                        elif "large" in tags:
                            size = "l"
                        elif "medium" in tags:
                            size = "m"
                        elif "small" in tags:
                            size = "s"

                        # Capture restrictive tags (non-generic) for compatibility matching
                        restrictive = [t for t in tags if t not in _GENERIC_TAGS]
                        if restrictive:
                            compat_tags = " ".join(sorted(set(restrictive)))
                        if size:
                            break
            except (KeyError, etree.XMLSyntaxError):
                pass

    if (not size and "spacesuit" in class_id) or "spacesuit" in macro_name:
        size = "xs"

    if class_id == "engine" or class_id == "thruster":
        thrust_el = macro_el.find("properties/thrust")
        boost_el = macro_el.find("properties/boost")
        travel_el = macro_el.find("properties/travel")

        out.engines.append({
            "engine_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "class_id": class_id,
            "size": size,
            "compat_tags": compat_tags,
            "faction_id": faction_id,
            "mk": mk,
            "thrust_forward": _float(thrust_el, "forward"),
            "thrust_reverse": _float(thrust_el, "reverse"),
            "thrust_strafe": _float(thrust_el, "strafe"),
            "thrust_pitch": _float(thrust_el, "pitch"),
            "thrust_yaw": _float(thrust_el, "yaw"),
            "thrust_roll": _float(thrust_el, "roll"),
            "travel_thrust": _float(travel_el, "thrust"),
            "travel_attack": _float(travel_el, "attack"),
            "travel_charge": _float(travel_el, "charge"),
            "travel_release": _float(travel_el, "release"),
            "boost_thrust": _float(boost_el, "thrust"),
            "boost_duration": _float(boost_el, "duration"),
            "boost_attack": _float(boost_el, "attack"),
            "boost_release": _float(boost_el, "release"),
        })

    elif class_id == "shieldgenerator":
        recharge_el = macro_el.find("properties/recharge")

        out.shields.append({
            "shield_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "size": size,
            "compat_tags": compat_tags,
            "faction_id": faction_id,
            "mk": mk,
            "capacity": _float(recharge_el, "max"),
            "recharge_rate": _float(recharge_el, "rate"),
            "recharge_delay": _float(recharge_el, "delay"),
            "disruption_stability": _float(recharge_el, "disruptionstability"),
        })

    elif class_id in ["weapon", "turret", "missilelauncher", "bomblauncher", "missileturret", "spacesuitlaser"]:
        bullet_el = macro_el.find("properties/bullet")
        heat_el = macro_el.find("properties/heat")
        rot_el = macro_el.find("properties/rotationspeed")
        rotaccel_el = macro_el.find("properties/rotationacceleration")
        reload_el = macro_el.find("properties/reload")
        hull_el = macro_el.find("properties/hull")
        ammo_el = macro_el.find("properties/ammunition")
        storage_el = macro_el.find("properties/storage")

        default_bullet_id = bullet_el.get("class") if bullet_el is not None else None

        out.weapons.append({
            "weapon_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "class_id": class_id,
            "size": size,
            "compat_tags": compat_tags,
            "faction_id": faction_id,
            "mk": mk,
            "default_bullet_id": default_bullet_id,
            "heat_overheat": _float(heat_el, "overheat"),
            "heat_coolrate": _float(heat_el, "coolrate"),
            "heat_cooldelay": _float(heat_el, "cooldelay"),
            "heat_reenable": _float(heat_el, "reenable"),
            "rotation_speed": _float(rot_el, "max"),
            "rotation_accel": _float(rotaccel_el, "max"),
            "reload_rate": _float(reload_el, "rate"),
            "reload_time": _float(reload_el, "time"),
            "hull_max": _int(hull_el, "max"),
            "ammo_capacity": _int(ammo_el, "value"),
            "missile_storage": _int(storage_el, "missile"),
        })

    elif class_id in ["bullet", "missile", "bomb", "spacesuitbomb"]:
        bullet_el = macro_el.find("properties/bullet")
        reload_el = macro_el.find("properties/reload")
        damage_el = macro_el.find("properties/damage")
        heat_el = macro_el.find("properties/heat")
        explosion_el = macro_el.find("properties/explosiondamage")
        ammo_el = macro_el.find("properties/ammunition")
        missile_el = macro_el.find("properties/missile")
        area_el = macro_el.find("properties/areadamage")

        out.bullets.append({
            "bullet_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "speed": _float(bullet_el, "speed"),
            "lifetime": _float(bullet_el, "lifetime"),
            "amount": _int(bullet_el, "amount") or 1,
            "barrelamount": _int(bullet_el, "barrelamount") or 1,
            "angle": _float(bullet_el, "angle"),
            "maxhits": _int(bullet_el, "maxhits"),
            "range_direct": _float(bullet_el, "range"),
            "reload_rate": _float(reload_el, "rate"),
            "reload_time": _float(reload_el, "time"),
            "damage": _float(damage_el, "value"),
            "shield_damage": _float(damage_el, "shield"),
            "hull_damage": _float(damage_el, "hull"),
            "shield_disruption": _float(damage_el, "shielddisruption"),
            "heat_value": _float(heat_el, "value"),
            "explosion_hull": _float(explosion_el, "hull"),
            "explosion_shield": _float(explosion_el, "shield"),
            "ammo_value": _int(ammo_el, "value"),
            "ammo_reload": _float(ammo_el, "reload"),
            "missile_lifetime": _float(missile_el, "lifetime"),
            "missile_range": _float(missile_el, "range"),
            "area_damage": _float(area_el, "value"),
            "area_lifetime": _float(area_el, "lifetime"),
        })

    elif class_id in ["satellite", "navbeacon", "resourceprobe", "mine", "countermeasure"]:
        radar_el = macro_el.find("properties/radar")
        hull_el = macro_el.find("properties/hull")
        exp_el = macro_el.find("properties/explosioneffect")

        out.deployables.append({
            "deployable_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "class_id": class_id,
            "radar_range": _float(radar_el, "range") if radar_el is not None else None,
            "hull": _float(hull_el, "max") if hull_el is not None else None,
            "explosioneffect_strength": _float(exp_el, "strength") if exp_el is not None else None,
        })

    elif class_id in ["scanner", "computer", "radar"]:
        scan_el = macro_el.find("properties/scan")
        radar_el = macro_el.find("properties/radar")
        out.software.append({
            "software_id": macro_name,
            "name": name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "class_id": class_id,
            "scan_maxlevel": _int(scan_el, "maxlevel") if scan_el is not None else None,
            "radar_range": _float(radar_el, "range") if radar_el is not None else None,
        })


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace equipment rows in static.db."""
    conn.execute("DELETE FROM equip_weapons")
    conn.execute("DELETE FROM equip_bullets")
    conn.execute("DELETE FROM equip_shields")
    conn.execute("DELETE FROM equip_engines")
    conn.execute("DELETE FROM equip_deployables")
    conn.execute("DELETE FROM equip_software")

    # Engines
    conn.executemany(
        "INSERT INTO equip_engines ("
        "  engine_id, name, file_path, is_legacy, dlc, class_id, size, compat_tags, faction_id, mk,"
        "  thrust_forward, thrust_reverse, thrust_strafe, thrust_pitch, thrust_yaw, thrust_roll,"
        "  travel_thrust, travel_attack, travel_charge, travel_release,"
        "  boost_thrust, boost_duration, boost_attack, boost_release"
        ") VALUES ("
        "  :engine_id, :name, :file_path, :is_legacy, :dlc, :class_id, :size, :compat_tags, :faction_id, :mk,"
        "  :thrust_forward, :thrust_reverse, :thrust_strafe, :thrust_pitch, :thrust_yaw, :thrust_roll,"
        "  :travel_thrust, :travel_attack, :travel_charge, :travel_release,"
        "  :boost_thrust, :boost_duration, :boost_attack, :boost_release"
        ")",
        result.engines,
    )

    # Shields
    conn.executemany(
        "INSERT INTO equip_shields (shield_id, name, file_path, is_legacy, dlc, size, compat_tags, faction_id, mk, capacity, recharge_rate, recharge_delay, disruption_stability) "
        "VALUES (:shield_id, :name, :file_path, :is_legacy, :dlc, :size, :compat_tags, :faction_id, :mk, :capacity, :recharge_rate, :recharge_delay, :disruption_stability)",
        result.shields,
    )

    # Bullets
    conn.executemany(
        "INSERT INTO equip_bullets ("
        "  bullet_id, name, file_path, is_legacy, dlc,"
        "  speed, lifetime, amount, barrelamount, angle, maxhits, range_direct,"
        "  reload_rate, reload_time,"
        "  damage, shield_damage, hull_damage, shield_disruption,"
        "  heat_value, explosion_hull, explosion_shield,"
        "  ammo_value, ammo_reload,"
        "  missile_lifetime, missile_range,"
        "  area_damage, area_lifetime"
        ") VALUES ("
        "  :bullet_id, :name, :file_path, :is_legacy, :dlc,"
        "  :speed, :lifetime, :amount, :barrelamount, :angle, :maxhits, :range_direct,"
        "  :reload_rate, :reload_time,"
        "  :damage, :shield_damage, :hull_damage, :shield_disruption,"
        "  :heat_value, :explosion_hull, :explosion_shield,"
        "  :ammo_value, :ammo_reload,"
        "  :missile_lifetime, :missile_range,"
        "  :area_damage, :area_lifetime"
        ")",
        result.bullets,
    )

    # Weapons
    conn.executemany(
        "INSERT INTO equip_weapons ("
        "  weapon_id, name, file_path, is_legacy, dlc, class_id, size, compat_tags, faction_id, mk,"
        "  default_bullet_id, heat_overheat, heat_coolrate, heat_cooldelay, heat_reenable,"
        "  rotation_speed, rotation_accel, reload_rate, reload_time, hull_max,"
        "  ammo_capacity, missile_storage"
        ") VALUES ("
        "  :weapon_id, :name, :file_path, :is_legacy, :dlc, :class_id, :size, :compat_tags, :faction_id, :mk,"
        "  :default_bullet_id, :heat_overheat, :heat_coolrate, :heat_cooldelay, :heat_reenable,"
        "  :rotation_speed, :rotation_accel, :reload_rate, :reload_time, :hull_max,"
        "  :ammo_capacity, :missile_storage"
        ")",
        result.weapons,
    )

    # Deployables
    conn.executemany(
        "INSERT INTO equip_deployables (deployable_id, name, file_path, is_legacy, dlc, class_id, radar_range, hull, explosioneffect_strength) "
        "VALUES (:deployable_id, :name, :file_path, :is_legacy, :dlc, :class_id, :radar_range, :hull, :explosioneffect_strength)",
        result.deployables,
    )

    # Software
    if result.software:
        conn.executemany(
            "INSERT INTO equip_software (software_id, name, file_path, is_legacy, class_id, scan_maxlevel, radar_range) "
            "VALUES (:software_id, :name, :file_path, :is_legacy, :class_id, :scan_maxlevel, :radar_range)",
            result.software,
        )


def _xpath_elements(node: etree._Element, query: str) -> list[etree._Element]:
    result = node.xpath(query)
    if not isinstance(result, list):
        return []
    return [item for item in result if isinstance(item, etree._Element)]
