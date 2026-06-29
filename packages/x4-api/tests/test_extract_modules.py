"""Test for the modules extractor."""

from __future__ import annotations

import sqlite3

from x4_extract.static import modules

# macros.xml index pointing at two module entries
INDEX_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <entry name="prod_arg_foodrations_01_macro" value="assets/structures/production/macros/prod_arg_foodrations_01_macro" />
  <entry name="hab_arg_l_01_macro"            value="assets/structures/habitation/macros/hab_arg_l_01_macro" />
  <entry name="ship_arg_s_fighter_01_a_macro" value="assets/units/size_s/macros/ship_arg_s_fighter_01_a_macro" />
</macros>
"""

_MACRO_FILES: dict[str, bytes] = {
    "assets/structures/production/macros/prod_arg_foodrations_01_macro.xml": b"""
<macros>
  <macro name="prod_arg_foodrations_01_macro" class="production">
    <component ref="prod_arg_foodrations_01" />
    <properties>
      <identification name="{20104,30101}" makerrace="argon" />
      <hull max="120000" />
      <explosiondamage value="5000" />
      <workforce capacity="10" />
      <production>
        <queue ware="foodrations" />
      </production>
    </properties>
  </macro>
</macros>
""",
    "assets/structures/habitation/macros/hab_arg_l_01_macro.xml": b"""
<macros>
  <macro name="hab_arg_l_01_macro" class="habitation">
    <component ref="hab_arg_l_01" />
    <properties>
      <identification name="{20104,40101}" size="large" makerrace="argon" />
      <hull max="80000" />
      <workforce max="500" />
    </properties>
  </macro>
</macros>
""",
    "assets/units/size_s/macros/ship_arg_s_fighter_01_a_macro.xml": b"""
<macros>
  <macro name="ship_arg_s_fighter_01_a_macro" class="ship_s">
    <component ref="ship_arg_s_fighter_01_a" />
    <properties>
      <identification name="{20101,101}" />
      <hull max="1000" />
    </properties>
  </macro>
</macros>
""",
}


def _resolve_path(path: str) -> bytes:
    if path in _MACRO_FILES:
        return _MACRO_FILES[path]
    raise KeyError(path)


def _resolve_name(name: str) -> bytes:
    raise KeyError(name)


def test_extract_filters_by_module_class() -> None:
    result = modules.extract(INDEX_XML, _resolve_path, _resolve_name)
    ids = {m["module_id"] for m in result.modules}
    # ship_s should be excluded; both module classes should be included
    assert "prod_arg_foodrations_01_macro" in ids
    assert "hab_arg_l_01_macro" in ids
    assert "ship_arg_s_fighter_01_a_macro" not in ids


def test_extract_pulls_module_identity_and_attributes() -> None:
    result = modules.extract(INDEX_XML, _resolve_path, _resolve_name)

    prod = next(m for m in result.modules if m["module_id"] == "prod_arg_foodrations_01_macro")
    assert prod["kind"] == "production"
    assert prod["produces_ware_id"] == "foodrations"
    assert prod["hull"] == 120000

    hab = next(m for m in result.modules if m["module_id"] == "hab_arg_l_01_macro")
    assert hab["kind"] == "habitation"
    assert hab["size"] == "large"


def test_write_round_trips_through_static_db(static_conn: sqlite3.Connection) -> None:
    result = modules.extract(INDEX_XML, _resolve_path, _resolve_name)
    modules.write(static_conn, result)
    static_conn.commit()

    rows = static_conn.execute("SELECT * FROM modules ORDER BY module_id").fetchall()
    assert len(rows) == 2

    prod = dict(next(r for r in rows if r["module_id"] == "prod_arg_foodrations_01_macro"))
    assert prod["kind"] == "production"
    assert prod["produces_ware_id"] == "foodrations"
    assert prod["hull"] == 120000
