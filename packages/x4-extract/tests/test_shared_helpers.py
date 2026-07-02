from __future__ import annotations

import sqlite3

from lxml import etree
from x4_extract.dynamic.extractors.common import (
    component_class_registrations,
    enclosing_sector_zone,
    extra_json_from_attrs,
)
from x4_extract.parsing import (
    str_float,
    str_int,
    xml_attr_float,
    xml_attr_int,
    xml_attr_int_or_none,
)
from x4_extract.static.id_name import append_id_name_rows
from x4_extract.static.raw import RawFileStore


def test_xml_numeric_helpers_preserve_existing_coercion_policy() -> None:
    el = etree.fromstring(b'<item whole="42" floatint="5.0" bad="nope" rate="1.5"/>')

    assert xml_attr_int(el, "whole") == 42
    assert xml_attr_int(el, "floatint") == 5
    assert xml_attr_int_or_none(el, "bad") is None
    assert xml_attr_float(el, "rate") == 1.5
    assert str_int("7.0") == 7
    assert str_int("") is None
    assert str_float("2.5") == 2.5
    assert str_float("bad") is None


def test_append_id_name_rows_skips_items_without_id() -> None:
    rows: list[dict[str, str | None]] = []

    append_id_name_rows(
        b'<root><entry id="a" name="A"/><entry name="missing"/></root>',
        item_tag="entry",
        id_column="entry_id",
        rows=rows,
    )

    assert rows == [{"entry_id": "a", "name": "A"}]


def test_extra_json_from_attrs_returns_only_unmapped_attrs() -> None:
    assert (
        extra_json_from_attrs(
            {"id": "known", "state": "extra"},
            frozenset({"id"}),
            {"derived": True},
        )
        == '{"derived": true, "state": "extra"}'
    )
    assert extra_json_from_attrs({"id": "known"}, frozenset({"id"})) is None


def test_component_class_registrations() -> None:
    def visitor(_elem: etree._Element) -> None:
        return None

    regs = component_class_registrations(("ship_s", "ship_m"), visitor)

    assert [r.target.class_attr for r in regs] == ["ship_s", "ship_m"]
    assert all(r.target.tag == "component" for r in regs)
    assert all(r.visitor is visitor for r in regs)


def test_enclosing_sector_zone() -> None:
    root = etree.fromstring(
        b"""
        <component class="sector" macro="sector_a">
          <component class="zone" macro="zone_a">
            <component class="ship_s" id="ship"/>
          </component>
        </component>
        """
    )
    ship = root.find("component/component")
    assert ship is not None

    assert enclosing_sector_zone(ship) == ("sector_a", "zone_a")


def test_raw_file_store_path_name_and_extension_fallback() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE raw_files (filepath TEXT, directory TEXT, filename TEXT, content TEXT)"
    )
    conn.execute(
        "INSERT INTO raw_files (filepath, directory, filename, content) VALUES (?, ?, ?, ?)",
        ("assets/Props/Thing.xml", "assets/Props", "Thing.xml", "<root/>"),
    )

    store = RawFileStore(conn)

    assert store.get_path("assets/props/thing.xml") == b"<root/>"
    assert store.get_path("extensions/ego_dlc/assets/Props/Thing.xml") == b"<root/>"
    assert store.require_name("Thing") == b"<root/>"
    assert store.preload().require_path("assets/props/thing.xml") == b"<root/>"
