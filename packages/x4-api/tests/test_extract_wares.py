"""EXEMPLAR test for a static-XML extractor.

Pattern for any extract/<library>.py:
    1. Define a tiny inline XML payload that exercises the cases you care about.
    2. Call the pure `extract()` and assert on the returned ExtractResult.
    3. Separately verify `write()` round-trips through SQLite.

Avoid loading the real wares.xml in unit tests — it's huge and changes every patch.
Golden-file regression belongs in integration tests behind a marker.
"""

from __future__ import annotations

import sqlite3

from x4_extract.static import wares

TINY_WARES_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<wares>
  <ware id="energycells" name="Energy Cells" transport="container" volume="1"
        group="energy" storage="container">
    <price min="14" average="16" max="18"/>
    <production time="40" amount="175" method="default">
      <primary>
        <ware ware="hydrogen" amount="60"/>
      </primary>
      <effects>
        <effect type="work" product="0.2"/>
      </effects>
    </production>
    <icon active="ware_energycells"/>
  </ware>
  <ware id="hydrogen" name="Hydrogen" transport="liquid" volume="2" group="gas">
    <price min="36" average="48" max="60"/>
  </ware>
</wares>
"""


def test_extract_pulls_ware_identity_and_pricing() -> None:
    result = wares.extract(TINY_WARES_XML)

    assert len(result.wares) == 2
    ec = next(w for w in result.wares if w["ware_id"] == "energycells")
    assert ec["name"] == "Energy Cells"
    assert ec["transport"] == "container"
    assert ec["volume"] == 1.0
    assert ec["price_avg"] == 16
    assert ec["icon_path"] == "ware_energycells"


def test_extract_captures_production_method_and_inputs() -> None:
    result = wares.extract(TINY_WARES_XML)

    methods = [p for p in result.production if p["ware_id"] == "energycells"]
    assert len(methods) == 1
    assert methods[0]["method"] == "default"
    assert methods[0]["time_sec"] == 40.0
    assert methods[0]["amount"] == 175

    inputs = [i for i in result.inputs if i["ware_id"] == "energycells"]
    assert inputs == [
        {
            "ware_id": "energycells",
            "method": "default",
            "input_ware_id": "hydrogen",
            "amount": 60,
        }
    ]


def test_write_round_trips_through_static_db(static_conn: sqlite3.Connection) -> None:
    result = wares.extract(TINY_WARES_XML)
    wares.write(static_conn, result)
    static_conn.commit()

    names = [r["name"] for r in static_conn.execute("SELECT name FROM wares ORDER BY ware_id")]
    assert names == ["Energy Cells", "Hydrogen"]

    inputs = static_conn.execute("SELECT input_ware_id, amount FROM ware_inputs").fetchall()
    assert [(r["input_ware_id"], r["amount"]) for r in inputs] == [("hydrogen", 60)]
