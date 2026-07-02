"""Parse profiler: attribute the cost of one save ingest across distinct stages.

A full ingest is 5-10s and the save is a ~200 MB gzip XML tree whose useful telemetry
sits deep in <universe>, so the whole file must be streamed every refresh. Before
optimising the hot path we need to know *where* the time goes — decompression, lxml
tokenisation, our visitor dispatch, or the SQL flush. This module times each stage in
isolation on a real save and runs cProfile over the dispatch stage so Python-level
overhead is attributable.

Stages:
  decompress  — read the gunzipped stream to EOF, no XML parsing at all.
  iterparse   — etree.iterparse start+end with the same memory-bounding clear we use,
                but no visitor dispatch. Isolates raw tokenise + element build cost.
  dispatch    — full stream_save through every collector. dispatch - iterparse is the
                visitor-dispatch overhead.
  flush       — write accumulated rows for every tier into a throwaway DB (+ derived).

Run via `x4c profile-save [path]`.
"""

from __future__ import annotations

import cProfile
import gzip
import io
import pstats
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from typing import IO, cast

from lxml import etree

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema, open_db
from x4_extract.dynamic.collector import TIERS, Collector
from x4_extract.savefile.dispatch import stream_save

_READ_CHUNK = 1 << 20  # 1 MiB reads when draining the decompressed stream


@dataclass(slots=True)
class ProfileReport:
    save_path: Path
    file_size_mb: float
    decompressed_mb: float
    element_count: int
    decompress_sec: float
    iterparse_sec: float
    dispatch_sec: float
    flush_sec: float
    profile_lines: list[str] = field(default_factory=list)

    @property
    def dispatch_overhead_sec(self) -> float:
        """Time spent in our visitor dispatch beyond raw parse+build."""
        return max(0.0, self.dispatch_sec - self.iterparse_sec)

    @property
    def total_sec(self) -> float:
        return self.dispatch_sec + self.flush_sec


def _time_decompress(save_path: Path) -> tuple[float, float]:
    """Drain the gunzipped stream; return (seconds, decompressed MiB)."""
    total = 0
    t0 = perf_counter()
    with gzip.open(save_path, "rb") as gz:
        while chunk := gz.read(_READ_CHUNK):
            total += len(chunk)
    return perf_counter() - t0, total / 1_000_000


def _time_iterparse(save_path: Path) -> tuple[float, int]:
    """Tokenise + build elements with our memory-bounding clear, no dispatch.

    Mirrors the clear strategy in dispatch._dispatch so the delta against the dispatch
    stage isolates visitor-matching overhead rather than memory behaviour.
    """
    n = 0
    t0 = perf_counter()
    with gzip.open(save_path, "rb") as gz:
        context = etree.iterparse(cast("IO[bytes]", gz), events=("end",), huge_tree=True)
        for _event, elem in context:
            n += 1
            elem.clear(keep_tail=True)
            while elem.getprevious() is not None:
                parent = elem.getparent()
                if parent is None:
                    break
                del parent[0]
        del context
    return perf_counter() - t0, n


def _time_dispatch(
    settings: ExtractSettings, save_path: Path
) -> tuple[float, list[Collector], cProfile.Profile]:
    """Time a clean dispatch pass, then a separate profiled pass for attribution.

    cProfile intercepts tens of millions of calls and badly inflates wall clock, so the
    timing pass runs *without* the profiler; the profiled pass feeds the cProfile
    breakdown only. Returns (clean_seconds, collectors, profiler).
    """
    from x4_extract.dynamic.pipeline import build_collectors

    collectors = build_collectors(settings, save_path)
    registrations = [r for c in collectors for r in c.register()]

    t0 = perf_counter()
    stream_save(save_path, registrations)
    elapsed = perf_counter() - t0

    # Second pass under cProfile, for attribution only (not timed). Re-register so the
    # collectors above keep the rows from the clean pass for the flush stage.
    profiled = build_collectors(settings, save_path)
    profile_regs = [r for c in profiled for r in c.register()]
    profiler = cProfile.Profile()
    profiler.enable()
    stream_save(save_path, profile_regs)
    profiler.disable()
    return elapsed, collectors, profiler


def _time_flush(settings: ExtractSettings, save_path: Path, collectors: list[Collector]) -> float:
    """Write every tier into a throwaway DB (+ derived artifacts) and time it."""
    from x4_extract.dynamic.pipeline import _rewrite_tier, _run_derived

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "profile.db"
        apply_schema(settings.data_dir, "dynamic", db_path=db_path)
        conn = open_db(settings.data_dir, dynamic_db=db_path)
        try:
            t0 = perf_counter()
            with conn:
                for tier in TIERS:
                    _rewrite_tier(conn, collectors, tier)
                    _run_derived(conn, tier)
            return perf_counter() - t0
        finally:
            conn.close()


def _top_profile_lines(profiler: cProfile.Profile, limit: int = 15) -> list[str]:
    buf = io.StringIO()
    stats = pstats.Stats(profiler, stream=buf).sort_stats("cumulative")
    stats.print_stats(limit)
    return [line for line in buf.getvalue().splitlines() if line.strip()]


def profile_save(settings: ExtractSettings, save_path: Path) -> ProfileReport:
    """Time each ingest stage in isolation on `save_path`."""
    file_size_mb = save_path.stat().st_size / 1_000_000
    decompress_sec, decompressed_mb = _time_decompress(save_path)
    iterparse_sec, element_count = _time_iterparse(save_path)
    dispatch_sec, collectors, profiler = _time_dispatch(settings, save_path)
    flush_sec = _time_flush(settings, save_path, collectors)
    return ProfileReport(
        save_path=save_path,
        file_size_mb=file_size_mb,
        decompressed_mb=decompressed_mb,
        element_count=element_count,
        decompress_sec=decompress_sec,
        iterparse_sec=iterparse_sec,
        dispatch_sec=dispatch_sec,
        flush_sec=flush_sec,
        profile_lines=_top_profile_lines(profiler),
    )


def format_report(report: ProfileReport) -> str:
    """Human-readable breakdown for the CLI."""
    lines = [
        f"Save: {report.save_path.name}",
        f"  compressed:   {report.file_size_mb:8.1f} MB",
        f"  decompressed: {report.decompressed_mb:8.1f} MB  ({report.element_count:,} elements)",
        "",
        "Stage timings (wall clock):",
        f"  decompress only      {report.decompress_sec:7.2f}s",
        f"  + iterparse/build    {report.iterparse_sec:7.2f}s",
        f"  + visitor dispatch   {report.dispatch_sec:7.2f}s  "
        f"(dispatch overhead {report.dispatch_overhead_sec:.2f}s)",
        f"  flush + derived      {report.flush_sec:7.2f}s",
        f"  {'-' * 30}",
        f"  parse + flush total  {report.total_sec:7.2f}s",
        "",
        "Top cumulative time (cProfile, dispatch stage):",
        *(f"  {line}" for line in report.profile_lines),
    ]
    return "\n".join(lines)
