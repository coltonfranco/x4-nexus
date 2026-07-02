"""Build the `sector_distance` table: hop counts between sectors.

Structural artifact — only rebuilt when station/topology structure changes. The sector
graph is derived from the static map: gates and superhighways connect zones, and each
zone belongs to a sector (s.zones). Two sectors are adjacent when a gate/highway links
a zone in one to a zone in the other. Distances are all-pairs BFS hop counts.

`gate_distance` is left NULL in this minimal version; physical gate distances can be
layered in later from zone positions.
"""

import heapq
import math
import sqlite3
from collections import defaultdict


def build_sector_distance(conn: sqlite3.Connection) -> None:
    if not all(_static_has_table(conn, t) for t in ("zones", "gates", "superhighways", "sectors")):
        conn.execute("DELETE FROM sector_distance")
        return

    # Build the graph
    # Nodes: "s:sector_id" and "z:zone_id"
    # Edges: (neighbor, weight, manual_dist_add, fast_time_add, hops_add)
    adj = defaultdict(list)

    # Load zones and their coordinates
    zones = {}
    zones_by_sector = defaultdict(list)
    for row in conn.execute(
        "SELECT zone_id, sector_id, x, y, z FROM s.zones WHERE sector_id IS NOT NULL"
    ):
        z_id = row["zone_id"]
        s_id = row["sector_id"]
        x, y, z = row["x"] or 0.0, row["y"] or 0.0, row["z"] or 0.0
        zones[z_id] = (x, y, z)
        zones_by_sector[s_id].append(z_id)

    def dist3d(p1: tuple[float, float, float], p2: tuple[float, float, float]) -> float:
        return math.dist(p1, p2)

    SPEED_MANUAL = 2000.0
    SPEED_LOCAL = 5000.0
    TIME_GATE = 15.0
    TIME_SUPER = 30.0

    # 1. Intra-sector manual connections
    for s_id, z_ids in zones_by_sector.items():
        s_node = f"s:{s_id}"
        # Zone <-> Sector center
        for z_id in z_ids:
            z_node = f"z:{z_id}"
            d = dist3d(zones[z_id], (0.0, 0.0, 0.0))
            w = d / SPEED_MANUAL
            adj[s_node].append((z_node, w, d, 0.0, 0))
            adj[z_node].append((s_node, w, d, 0.0, 0))

        # Zone <-> Zone manual
        for i in range(len(z_ids)):
            for j in range(i + 1, len(z_ids)):
                z1, z2 = z_ids[i], z_ids[j]
                n1, n2 = f"z:{z1}", f"z:{z2}"
                d = dist3d(zones[z1], zones[z2])
                w = d / SPEED_MANUAL
                adj[n1].append((n2, w, d, 0.0, 0))
                adj[n2].append((n1, w, d, 0.0, 0))

    # 2. Gates
    for row in conn.execute("SELECT from_zone_id, to_zone_id FROM s.gates"):
        z1, z2 = row["from_zone_id"], row["to_zone_id"]
        if z1 in zones and z2 in zones:
            n1, n2 = f"z:{z1}", f"z:{z2}"
            adj[n1].append((n2, TIME_GATE, 0.0, TIME_GATE, 1))
            adj[n2].append((n1, TIME_GATE, 0.0, TIME_GATE, 1))

    # 3. Superhighways
    for row in conn.execute("SELECT from_zone_id, to_zone_id, kind FROM s.superhighways"):
        z1, z2 = row["from_zone_id"], row["to_zone_id"]
        if z1 in zones and z2 in zones:
            n1, n2 = f"z:{z1}", f"z:{z2}"
            if row["kind"] == "localhighway":
                d = dist3d(zones[z1], zones[z2])
                t = d / SPEED_LOCAL
                adj[n1].append((n2, t, 0.0, t, 0))
                adj[n2].append((n1, t, 0.0, t, 0))
            else:
                adj[n1].append((n2, TIME_SUPER, 0.0, TIME_SUPER, 1))
                adj[n2].append((n1, TIME_SUPER, 0.0, TIME_SUPER, 1))

    conn.execute("DELETE FROM sector_distance")
    rows = []
    all_sectors = list(zones_by_sector.keys())

    for source_id in all_sectors:
        start_node = f"s:{source_id}"

        # Dijkstra
        # Priority queue stores (weight, node, manual_dist, fast_time, hops)
        pq = [(0.0, start_node, 0.0, 0.0, 0)]
        visited = set()
        best_dist: dict[str, float] = {}

        while pq:
            w, u, m_dist, f_time, h = heapq.heappop(pq)

            if u in visited:
                continue
            visited.add(u)

            if u.startswith("s:") and u != start_node:
                target_id = u[2:]
                rows.append((source_id, target_id, h, m_dist, f_time))

            for v, edge_w, edge_m, edge_f, edge_h in adj[u]:
                if v not in visited:
                    new_w = w + edge_w
                    if v not in best_dist or new_w < best_dist[v]:
                        best_dist[v] = new_w
                        heapq.heappush(pq, (new_w, v, m_dist + edge_m, f_time + edge_f, h + edge_h))

    conn.executemany(
        "INSERT OR REPLACE INTO sector_distance (from_sector_id, to_sector_id, hops, manual_distance, fast_travel_time) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )


def _static_has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM s.sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None
