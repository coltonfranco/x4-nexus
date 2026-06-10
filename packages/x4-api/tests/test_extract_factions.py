"""Test for the factions extractor."""

from __future__ import annotations

import sqlite3

from x4_extract.static import factions

TINY_FACTIONS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<factions>
  <faction id="argon" name="Argon Federation" primaryrace="argon" shortname="ARG" prefixname="Argon" description="The Argon" tags="economic">
    <color ref="faction_argon" />
    <icon active="faction_argon" />
  </faction>
  <faction id="xenon" name="Xenon" primaryrace="xenon">
    <color ref="faction_xenon" />
  </faction>
  <faction id="mystery" name="Mystery">
  </faction>
</factions>
"""

TINY_COLORS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<colormap>
  <color id="blue_bright" r="0" g="120" b="215" a="255" />
  <color id="red_dark" r="180" g="0" b="0" a="255" />
  <mapping id="faction_argon" ref="blue_bright" />
  <mapping id="faction_xenon" ref="red_dark" />
</colormap>
"""


def test_extract_pulls_faction_identity_and_color() -> None:
    result = factions.extract(TINY_FACTIONS_XML, TINY_COLORS_XML)

    assert len(result.factions) == 3
    argon = next(f for f in result.factions if f["faction_id"] == "argon")
    assert argon["name"] == "Argon Federation"
    assert argon["primary_race"] == "argon"
    assert argon["color_hex"] == "#0078D7"
    assert argon["short_name"] == "ARG"
    assert argon["prefix_name"] == "Argon"
    assert argon["description"] == "The Argon"
    assert argon["tags"] == "economic"
    assert argon["icon_active"] == "faction_argon"

    xenon = next(f for f in result.factions if f["faction_id"] == "xenon")
    assert xenon["color_hex"] == "#B40000"

    mystery = next(f for f in result.factions if f["faction_id"] == "mystery")
    assert mystery["color_hex"] is None


def test_extract_works_without_colors_xml() -> None:
    result = factions.extract(TINY_FACTIONS_XML)
    argon = next(f for f in result.factions if f["faction_id"] == "argon")
    assert argon["color_hex"] is None


def test_write_round_trips_through_static_db(static_conn: sqlite3.Connection) -> None:
    result = factions.extract(TINY_FACTIONS_XML, TINY_COLORS_XML)
    factions.write(static_conn, result)
    static_conn.commit()

    rows = static_conn.execute("SELECT * FROM factions ORDER BY faction_id").fetchall()
    assert len(rows) == 3

    argon = dict(next(r for r in rows if r["faction_id"] == "argon"))
    assert argon["name"] == "Argon Federation"
    assert argon["color_hex"] == "#0078D7"
    assert argon["primary_race"] == "argon"
    assert argon["short_name"] == "ARG"
    assert argon["icon_active"] == "faction_argon"
