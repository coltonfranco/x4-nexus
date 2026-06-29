"""Tests for the ships static extractor."""

from __future__ import annotations

import sqlite3

from x4_extract.static import ships

TINY_MACROS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<index>
  <entry name="ship_arg_s_fighter_01_a_macro" value="assets/units/size_s/ship_arg_s_fighter_01_a_macro" />
  <entry name="units_size_l_miner_macro" value="assets/units/size_l/units_size_l_miner_macro" />
  <entry name="not_a_ship_macro" value="assets/props/not_a_ship_macro" />
</index>
"""

TINY_SHIP_1_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="ship_arg_s_fighter_01_a_macro" class="ship_s">
    <properties>
      <identification name="Elite Vanguard" makerrace="argon" icon="ship_s_fighter_01" />
      <purpose primary="fight" />
      <hull max="1200" />
      <storage cargo="200" />
      <physics mass="10">
        <drag forward="5.0" />
      </physics>
    </properties>
  </macro>
</macros>
"""

TINY_SHIP_2_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="units_size_l_miner_macro" class="ship_l">
    <properties>
      <identification name="Magnetar" makerrace="argon" icon="ship_l_miner_01" />
      <purpose primary="mine" />
      <hull max="24000" />
      <storage unit="10" cargo="8000" />
      <physics mass="100">
        <drag forward="20.0" />
      </physics>
    </properties>
  </macro>
</macros>
"""

def mock_resolve(path: str) -> bytes:
    if path == "assets/units/size_s/ship_arg_s_fighter_01_a_macro.xml":
        return TINY_SHIP_1_XML
    if path == "assets/units/size_l/units_size_l_miner_macro.xml":
        return TINY_SHIP_2_XML
    raise KeyError(path)


def test_extract_ships_pulls_basic_fields() -> None:
    result = ships.extract(TINY_MACROS_XML, mock_resolve, mock_resolve)
    
    assert len(result.ships) == 2
    
    s1 = next(s for s in result.ships if s["ship_id"] == "ship_arg_s_fighter_01_a_macro")
    assert s1["name"] == "Elite Vanguard"
    assert s1["class_id"] == "s"
    assert s1["faction_id"] == "argon"
    assert s1["role"] == "fight"
    assert s1["hull"] == 1200
    assert s1["cargo_volume"] == 200
    assert s1["icon_path"] == "ship_s_fighter_01"
    
    s2 = next(s for s in result.ships if s["ship_id"] == "units_size_l_miner_macro")
    assert s2["class_id"] == "l"
    assert s2["cargo_volume"] == 8000


def test_write_round_trips_through_static_db(static_conn: sqlite3.Connection) -> None:
    result = ships.extract(TINY_MACROS_XML, mock_resolve, mock_resolve)
    ships.write(static_conn, result)
    static_conn.commit()

    rows = static_conn.execute("SELECT name, class_id FROM ships ORDER BY name").fetchall()
    assert [(r["name"], r["class_id"]) for r in rows] == [("Elite Vanguard", "s"), ("Magnetar", "l")]
