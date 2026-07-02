"""REST endpoints for user-authored station designs (the dashboard station builder).

These live in the standalone `appdata.db` (see `deps.get_appdata_db`), independent of
static/dynamic game data: a design persists across save switches and DB rebuilds. The
builder serializes its React-Flow graph as `nodes` (placed modules, referenced by static
`module_id`) plus `edges` (connections); live module fields are rehydrated from the catalog
on the client, so only references and layout are stored here.
"""

import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from x4_api.api.deps import get_appdata_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


# --- Wire models ------------------------------------------------------------------


class BuilderNode(BaseModel):
    node_id: str
    module_id: str
    pos_x: float
    pos_y: float
    handle_positions: str | None = None  # JSON blob, opaque to the server


class BuilderEdge(BaseModel):
    edge_id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class BuilderStationInput(BaseModel):
    name: str
    notes: str | None = None
    grid_mode: bool = True
    # Provenance (set when forking an in-game station into an editable design).
    source_kind: str = "user"  # 'user' | 'imported'
    source_ref: str | None = None  # game station_id this was forked from, if any
    nodes: list[BuilderNode] = []
    edges: list[BuilderEdge] = []


class BuilderStationSummary(PublicModel):
    id: str
    name: str
    notes: str | None
    grid_mode: bool
    source_kind: str
    source_ref: str | None
    node_count: int
    edge_count: int
    created_at: str
    updated_at: str


class BuilderStationDetail(PublicModel):
    id: str
    name: str
    notes: str | None
    grid_mode: bool
    source_kind: str
    source_ref: str | None
    created_at: str
    updated_at: str
    nodes: list[BuilderNode]
    edges: list[BuilderEdge]


# --- Helpers ----------------------------------------------------------------------


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _write_children(conn: sqlite3.Connection, station_id: str, body: BuilderStationInput) -> None:
    """Insert the node/edge rows for a station. Caller owns the transaction."""
    conn.executemany(
        "INSERT INTO builder_station_nodes "
        "(station_id, node_id, module_id, pos_x, pos_y, handle_positions) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [
            (station_id, n.node_id, n.module_id, n.pos_x, n.pos_y, n.handle_positions)
            for n in body.nodes
        ],
    )
    conn.executemany(
        "INSERT INTO builder_station_edges "
        "(station_id, edge_id, source, target, source_handle, target_handle) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [
            (station_id, e.edge_id, e.source, e.target, e.source_handle, e.target_handle)
            for e in body.edges
        ],
    )


def _load_detail(conn: sqlite3.Connection, station_id: str) -> BuilderStationDetail:
    row = conn.execute(
        "SELECT id, name, notes, grid_mode, source_kind, source_ref, created_at, updated_at "
        "FROM builder_stations WHERE id = ?",
        (station_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Station design not found")
    nodes = [
        BuilderNode(
            node_id=r["node_id"],
            module_id=r["module_id"],
            pos_x=r["pos_x"],
            pos_y=r["pos_y"],
            handle_positions=r["handle_positions"],
        )
        for r in conn.execute(
            "SELECT node_id, module_id, pos_x, pos_y, handle_positions "
            "FROM builder_station_nodes WHERE station_id = ?",
            (station_id,),
        ).fetchall()
    ]
    edges = [
        BuilderEdge(
            edge_id=r["edge_id"],
            source=r["source"],
            target=r["target"],
            source_handle=r["source_handle"],
            target_handle=r["target_handle"],
        )
        for r in conn.execute(
            "SELECT edge_id, source, target, source_handle, target_handle "
            "FROM builder_station_edges WHERE station_id = ?",
            (station_id,),
        ).fetchall()
    ]
    return BuilderStationDetail(
        id=row["id"],
        name=row["name"],
        notes=row["notes"],
        grid_mode=bool(row["grid_mode"]),
        source_kind=row["source_kind"],
        source_ref=row["source_ref"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        nodes=nodes,
        edges=edges,
    )


# --- Endpoints --------------------------------------------------------------------


@router.get("/builder/stations", response_model=list[BuilderStationSummary])
def list_builder_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_appdata_db)],
) -> list[BuilderStationSummary]:
    rows = conn.execute(
        "SELECT b.id, b.name, b.notes, b.grid_mode, b.source_kind, b.source_ref, "
        "       b.created_at, b.updated_at, "
        "       (SELECT COUNT(*) FROM builder_station_nodes n WHERE n.station_id = b.id) AS node_count, "
        "       (SELECT COUNT(*) FROM builder_station_edges e WHERE e.station_id = b.id) AS edge_count "
        "FROM builder_stations b ORDER BY b.updated_at DESC"
    ).fetchall()
    return [
        BuilderStationSummary(
            id=r["id"],
            name=r["name"],
            notes=r["notes"],
            grid_mode=bool(r["grid_mode"]),
            source_kind=r["source_kind"],
            source_ref=r["source_ref"],
            node_count=r["node_count"],
            edge_count=r["edge_count"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


@router.get("/builder/stations/{station_id}", response_model=BuilderStationDetail)
def get_builder_station(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_appdata_db)],
) -> BuilderStationDetail:
    return _load_detail(conn, station_id)


@router.post("/builder/stations", response_model=BuilderStationDetail)
def create_builder_station(
    body: BuilderStationInput,
    conn: Annotated[sqlite3.Connection, Depends(get_appdata_db)],
) -> BuilderStationDetail:
    station_id = str(uuid.uuid4())
    now = _now()
    source_kind = body.source_kind if body.source_kind in ("user", "imported") else "user"
    with conn:  # transaction: commit on success, rollback on error
        conn.execute(
            "INSERT INTO builder_stations "
            "(id, name, notes, grid_mode, source_kind, source_ref, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                station_id,
                body.name,
                body.notes,
                int(body.grid_mode),
                source_kind,
                body.source_ref,
                now,
                now,
            ),
        )
        _write_children(conn, station_id, body)
    return _load_detail(conn, station_id)


@router.put("/builder/stations/{station_id}", response_model=BuilderStationDetail)
def update_builder_station(
    station_id: str,
    body: BuilderStationInput,
    conn: Annotated[sqlite3.Connection, Depends(get_appdata_db)],
) -> BuilderStationDetail:
    exists = conn.execute("SELECT 1 FROM builder_stations WHERE id = ?", (station_id,)).fetchone()
    if exists is None:
        raise HTTPException(status_code=404, detail="Station design not found")
    with conn:
        conn.execute(
            "UPDATE builder_stations SET name = ?, notes = ?, grid_mode = ?, updated_at = ? "
            "WHERE id = ?",
            (body.name, body.notes, int(body.grid_mode), _now(), station_id),
        )
        # Replace the full node/edge set (FK cascade not relied on — explicit + scoped).
        conn.execute("DELETE FROM builder_station_nodes WHERE station_id = ?", (station_id,))
        conn.execute("DELETE FROM builder_station_edges WHERE station_id = ?", (station_id,))
        _write_children(conn, station_id, body)
    return _load_detail(conn, station_id)


@router.delete("/builder/stations/{station_id}", status_code=204)
def delete_builder_station(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_appdata_db)],
) -> None:
    with conn:
        cur = conn.execute("DELETE FROM builder_stations WHERE id = ?", (station_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Station design not found")
