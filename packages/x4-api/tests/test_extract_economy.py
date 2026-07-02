"""Tests for the EconomyLogCollector — keep only the money + trade groups, route by the
parent <entries type>, and accumulate append-only (INSERT OR IGNORE is NULL-safe)."""

from __future__ import annotations

import gzip
import sqlite3
from pathlib import Path

from x4_extract.dynamic.collector import Tier
from x4_extract.dynamic.extractors.economy import EconomyLogCollector
from x4_extract.savefile.dispatch import stream_save

# economylog with all four groups. cargo/tradeoffer are the firehose we must SKIP; their
# <log type="trade"> rows are a deliberate trap (the element's own `type` looks like a trade
# but the parent group is not "trade").
_SAVE = b"""<?xml version="1.0"?>
<savegame>
  <economylog>
    <removed>
      <object id="40" owner="split" name="ZYA Hull Part Factory" code="RHC-446"/>
    </removed>
    <entries type="cargo">
      <log time="0" owner="[0xP1]" ware="silicon" v="53677" t2="10800"/>
      <log time="100" type="trade" owner="[0xP1]" ware="silicon" v="880"/>
    </entries>
    <entries type="tradeoffer">
      <log time="0" type="buyoffer" owner="[0xP1]" ware="silicon" price="11143" v="2527"/>
    </entries>
    <entries type="money">
      <log time="0" owner="[0xP1]" v="18693106" v2="44725000" t2="10800"/>
      <log time="64613.582" type="trade" owner="[0xP1]" partner="[0xN1]" v="9805840"/>
      <log time="64870.0" type="transfer" owner="[0xP2]" v="-5000"/>
    </entries>
    <entries type="trade">
      <log time="64613.582" type="trade" ware="silicon" buyer="[0xN1]" seller="[0xP1]" price="11143" v="880" b="99960" bmax="100000"/>
      <log time="65182.889" type="trade" ware="energycells" buyer="[0xP2]" seller="[0xN2]" price="1681" v="7000"/>
    </entries>
  </economylog>
</savegame>
"""


def _write(tmp_path: Path) -> Path:
    p = tmp_path / "econ.xml.gz"
    with gzip.open(p, "wb") as gz:
        gz.write(_SAVE)
    return p


def _stream(tmp_path: Path) -> EconomyLogCollector:
    c = EconomyLogCollector()
    stream_save(_write(tmp_path), c.register())
    return c


def test_keeps_only_money_and_trade_groups(tmp_path: Path) -> None:
    c = _stream(tmp_path)
    # cargo (incl. its decoy type="trade" row) and tradeoffer are dropped entirely.
    assert len(c.trades) == 2
    assert len(c.money) == 3


def test_trade_fields_parsed(tmp_path: Path) -> None:
    c = _stream(tmp_path)
    silicon = next(t for t in c.trades if t.ware == "silicon")
    assert silicon.time == 64613.582
    assert silicon.buyer == "[0xN1]"
    assert silicon.seller == "[0xP1]"
    assert silicon.price == 11143
    assert silicon.v == 880
    assert silicon.b == 99960 and silicon.bmax == 100000
    assert silicon.s is None and silicon.smax is None


def test_money_fields_and_reason_types(tmp_path: Path) -> None:
    c = _stream(tmp_path)
    by_type = {m.type for m in c.money}
    assert by_type == {None, "trade", "transfer"}
    baseline = next(m for m in c.money if m.type is None)
    assert baseline.owner == "[0xP1]"
    assert baseline.v == 18693106 and baseline.v2 == 44725000
    assert baseline.extra_json == '{"t2": "10800"}'  # unmapped attr preserved
    trade_evt = next(m for m in c.money if m.type == "trade")
    assert trade_evt.partner == "[0xN1]"


def test_flush_roundtrip_and_dedup(tmp_path: Path) -> None:
    """Two flushes of the same parse must not duplicate — the COALESCE unique index makes
    INSERT OR IGNORE NULL-safe (rows with NULL seller/partner/price still dedup)."""
    c = _stream(tmp_path)
    conn = sqlite3.connect(":memory:")
    schema = (
        Path(__file__).parents[2] / "x4-extract/src/x4_extract/sql/schema_dynamic.sql"
    ).read_text()
    conn.executescript(schema)

    c.flush(conn, Tier.VOLATILE)
    c.flush(conn, Tier.VOLATILE)  # idempotent

    assert conn.execute("SELECT COUNT(*) FROM economy_trade").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM economy_money").fetchone()[0] == 3


def test_append_only_contract(tmp_path: Path) -> None:
    """tables() must stay empty so the pipeline never DELETEs these append-only tables;
    only the VOLATILE tier carries a fingerprint."""
    c = _stream(tmp_path)
    assert c.tables(Tier.VOLATILE) == ()
    assert c.tables(Tier.STRUCTURAL) == ()
    assert c.fingerprint(Tier.STRUCTURAL) == ""
    assert c.fingerprint(Tier.VOLATILE) != ""
