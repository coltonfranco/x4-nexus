"""Build the `sector_distance` table: hop counts between sectors.

Structural artifact — only rebuilt when station/topology structure changes. The sector
graph is derived from the static map: gates and superhighways connect zones, and each
zone belongs to a sector (s.zones). Two sectors are adjacent when a gate/highway links
a zone in one to a zone in the other. Distances are all-pairs BFS hop counts.

`gate_distance` is left NULL in this minimal version; physical gate distances can be
layered in later from zone positions.
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict, deque


def build_sector_distance(conn: sqlite3.Connection) -> None:
    adjacency = _sector_adjacency(conn)
    conn.execute("DELETE FROM sector_distance")
    if not adjacency:
        return

    rows: list[tuple[str, str, int]] = []
    for source in adjacency:
        for target, hops in _bfs(adjacency, source).items():
            rows.append((source, target, hops))

    conn.executemany(
        "INSERT OR REPLACE INTO sector_distance (from_sector_id, to_sector_id, hops, gate_distance) "
        "VALUES (?, ?, ?, NULL)",
        rows,
    )


def _sector_adjacency(conn: sqlite3.Connection) -> dict[str, set[str]]:
    """Map sector_id → set of directly reachable sector_ids via gates/superhighways.

    Returns empty when static.db has not been built yet (no map tables to read), so a
    save can be ingested before `rebuild-static` without crashing.
    """
    if not all(_static_has_table(conn, t) for t in ("zones", "gates", "superhighways")):
        return {}

    zone_to_sector: dict[str, str] = {
        row["zone_id"]: row["sector_id"]
        for row in conn.execute("SELECT zone_id, sector_id FROM s.zones WHERE sector_id IS NOT NULL")
    }

    adjacency: dict[str, set[str]] = defaultdict(set)
    links = "SELECT from_zone_id, to_zone_id FROM s.gates UNION SELECT from_zone_id, to_zone_id FROM s.superhighways"
    for row in conn.execute(links):
        a = zone_to_sector.get(row["from_zone_id"])
        b = zone_to_sector.get(row["to_zone_id"])
        if a is None or b is None or a == b:
            continue
        adjacency[a].add(b)
        adjacency[b].add(a)
    return adjacency


def _static_has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM s.sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


def _bfs(adjacency: dict[str, set[str]], source: str) -> dict[str, int]:
    """Hop distance from `source` to every reachable sector (including itself at 0)."""
    dist = {source: 0}
    queue: deque[str] = deque([source])
    while queue:
        node = queue.popleft()
        for neighbour in adjacency.get(node, ()):
            if neighbour not in dist:
                dist[neighbour] = dist[node] + 1
                queue.append(neighbour)
    return dist
