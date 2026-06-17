"""Dispatch unit tests — isolated from the DB/schema so they exercise only the
depth-counter visitor matching, including the (tag, class) wildcard indexing that lets
a handful of `component` collectors coexist without re-checking every component element.
"""

from __future__ import annotations

import gzip
from pathlib import Path

from x4_extract.savefile.dispatch import Registration, Target, stream_save

# A miniature universe: nested components of various classes plus a parent-guarded leaf.
_SAVE = b"""<?xml version="1.0"?>
<savegame>
  <universe>
    <component class="galaxy">
      <component class="cluster">
        <component class="ship_s" id="ship-1"/>
        <component class="ship_l" id="ship-2"/>
        <component class="station" id="stat-1"/>
        <component class="weapon" id="weap-1"/>
        <component class="npc" id="npc-1"/>
      </component>
    </component>
  </universe>
  <log>
    <entry title="kept"/>
  </log>
  <messages>
    <entry title="dropped"/>
  </messages>
</savegame>
"""


def _write(tmp_path: Path) -> Path:
    p = tmp_path / "mini.xml.gz"
    with gzip.open(p, "wb") as gz:
        gz.write(_SAVE)
    return p


def _collector():
    hits: list[tuple[str, str | None]] = []

    def record(label, elem):
        hits.append((label, elem.get("id") or elem.get("title")))

    return hits, record


def test_class_wildcard_routes_by_class(tmp_path: Path) -> None:
    """Each (component, class) target fires only on its own class; unregistered classes
    (weapon) fire nothing."""
    ships, on_ship = _collector()
    stations, on_station = _collector()
    npcs, on_npc = _collector()

    regs = [
        Registration(Target(tag="component", class_attr="ship_s"), lambda e: on_ship("ship", e)),
        Registration(Target(tag="component", class_attr="ship_l"), lambda e: on_ship("ship", e)),
        Registration(Target(tag="component", class_attr="station"), lambda e: on_station("station", e)),
        Registration(Target(tag="component", class_attr="npc"), lambda e: on_npc("npc", e)),
    ]
    stream_save(_write(tmp_path), regs)

    assert {h[1] for h in ships} == {"ship-1", "ship-2"}
    assert {h[1] for h in stations} == {"stat-1"}
    assert {h[1] for h in npcs} == {"npc-1"}
    # weapon class was never registered → never dispatched (no KeyError, no spurious hit)


def test_parent_tag_guard(tmp_path: Path) -> None:
    """A plain wildcard with a parent_tag guard fires only under the named parent."""
    log_entries, on_log = _collector()
    regs = [
        Registration(Target(tag="entry", parent_tag="log"), lambda e: on_log("entry", e)),
    ]
    stream_save(_write(tmp_path), regs)

    assert [h[1] for h in log_entries] == ["kept"]  # not "dropped" (under <messages>)


def test_fixed_depth_and_wildcard_coexist(tmp_path: Path) -> None:
    """Fixed-depth and wildcard targets on the same tag both fire as appropriate."""
    fixed, on_fixed = _collector()
    wild, on_wild = _collector()
    # galaxy sits at depth 3 (savegame>universe>component[galaxy]); wildcard matches every component.
    regs = [
        Registration(Target(tag="component", depth=3, class_attr="galaxy"), lambda e: on_fixed("g", e)),
        Registration(Target(tag="component", class_attr="ship_s"), lambda e: on_wild("s", e)),
    ]
    stream_save(_write(tmp_path), regs)

    assert len(fixed) == 1
    assert {h[1] for h in wild} == {"ship-1"}
