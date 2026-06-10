"""Multi-save catalog + active-save resolution.

The save folder may hold dozens of saves; we never bulk-parse them. This module:

  * reads only the cheap `<info>` header of each save (stream-stops after `</info>`,
    milliseconds vs a full 200 MB pass) to drive a picker;
  * caches header reads in `<data_dir>/catalog.db` keyed by (path, mtime, size);
  * resolves the *active* save (user-selected via `active_save.txt`, else newest);
  * ensures the active save's per-save dynamic DB exists (empty schema if never built)
    so the read-only API always has something to ATTACH against.

One dynamic DB per save lives at `<data_dir>/dynamic/<save_key>.db`.
"""

from __future__ import annotations

import gzip
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from lxml import etree

from x4_extract.config import ExtractSettings, resolve_save_path, save_key
from x4_extract.db import apply_schema
from x4_extract.dynamic.pipeline import dynamic_db_path, source_fingerprint

_FALLBACK_DB = "_empty.db"  # ATTACH target when no save exists yet


@dataclass(slots=True, frozen=True)
class SaveInfo:
    key: str
    path: Path
    save_name: str | None
    in_game_time_sec: int | None
    real_time_iso: str | None
    game_version: str | None
    player_name: str | None
    player_credits: int | None
    size_bytes: int
    mtime: float
    db_built: bool
    db_current: bool  # a built DB whose source fingerprint matches the file on disk


# --- header reading --------------------------------------------------------------

def read_info_header(save_path: Path) -> dict[str, dict[str, str]]:
    """Return {save|game|player: {attr: value}} by streaming only up to `</info>`."""
    out: dict[str, dict[str, str]] = {}
    depth = 0
    with gzip.open(save_path, "rb") as gz:
        for event, elem in etree.iterparse(gz, events=("start", "end"), huge_tree=True):
            if event == "start":
                depth += 1
                continue
            if depth == 3 and elem.tag in ("save", "game", "player"):
                out[elem.tag] = {
                    (k if isinstance(k, str) else k.decode()): (
                        v if isinstance(v, str) else v.decode()
                    )
                    for k, v in elem.attrib.items()
                }
            depth -= 1
            if depth == 1 and elem.tag == "info":
                break
    return out


def _int(v: str | None) -> int | None:
    return int(float(v)) if v is not None else None


# --- catalog cache ---------------------------------------------------------------

def _open_catalog(settings: ExtractSettings) -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.data_dir / "catalog.db")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS save_catalog (
            path             TEXT PRIMARY KEY,
            mtime            REAL NOT NULL,
            size             INTEGER NOT NULL,
            save_name        TEXT,
            in_game_time_sec INTEGER,
            real_time_iso    TEXT,
            game_version     TEXT,
            player_name      TEXT,
            player_credits   INTEGER
        )
        """
    )
    return conn


def list_saves(settings: ExtractSettings, folder: Path | None = None) -> list[SaveInfo]:
    """All saves in the folder, newest first, with cached header data + DB status."""
    folder = folder or resolve_save_path(settings.save_path)
    cat = _open_catalog(settings)
    try:
        infos: list[SaveInfo] = []
        for path in folder.glob("*.xml.gz"):
            st = path.stat()
            row = cat.execute(
                "SELECT * FROM save_catalog WHERE path = ? AND mtime = ? AND size = ?",
                (str(path), st.st_mtime, st.st_size),
            ).fetchone()
            if row is None:
                row = _refresh_cache(cat, path, st.st_mtime, st.st_size)
            infos.append(_to_info(settings, path, st.st_mtime, st.st_size, row))
        cat.commit()
    finally:
        cat.close()
    infos.sort(key=lambda i: i.mtime, reverse=True)
    return infos


def _refresh_cache(cat: sqlite3.Connection, path: Path, mtime: float, size: int) -> sqlite3.Row:
    header = read_info_header(path)
    save, game, player = header.get("save", {}), header.get("game", {}), header.get("player", {})
    cat.execute(
        """
        INSERT OR REPLACE INTO save_catalog
            (path, mtime, size, save_name, in_game_time_sec, real_time_iso,
             game_version, player_name, player_credits)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(path), mtime, size,
            save.get("name"), _int(game.get("time")), _real_time(save.get("date")),
            game.get("version"), player.get("name"), _int(player.get("money")),
        ),
    )
    fetched: sqlite3.Row | None = cat.execute(
        "SELECT * FROM save_catalog WHERE path = ?", (str(path),)
    ).fetchone()
    assert fetched is not None
    return fetched


def _real_time(date: str | None) -> str | None:
    """X4 stores the real-world save time as a unix timestamp; surface it as ISO."""
    if date is None:
        return None
    try:
        return datetime.fromtimestamp(int(date), tz=UTC).isoformat()
    except (ValueError, OverflowError, OSError):
        return date


def _to_info(
    settings: ExtractSettings, path: Path, mtime: float, size: int, row: sqlite3.Row
) -> SaveInfo:
    db = dynamic_db_path(settings, path)
    built = db.exists()
    current = built and _db_source(db) == source_fingerprint(path)
    return SaveInfo(
        key=save_key(path),
        path=path,
        save_name=row["save_name"],
        in_game_time_sec=row["in_game_time_sec"],
        real_time_iso=row["real_time_iso"],
        game_version=row["game_version"],
        player_name=row["player_name"],
        player_credits=row["player_credits"],
        size_bytes=size,
        mtime=mtime,
        db_built=built,
        db_current=current,
    )


def db_is_current(settings: ExtractSettings, save_path: Path) -> bool:
    """True when the save's per-save DB exists and its source fingerprint is up to date."""
    db = dynamic_db_path(settings, save_path)
    return db.exists() and _db_source(db) == source_fingerprint(save_path)


def _db_source(db_path: Path) -> str | None:
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return None
    try:
        row = conn.execute("SELECT fingerprint FROM ingest_state WHERE tier = 'source'").fetchone()
        return row[0] if row else None
    except sqlite3.OperationalError:
        return None
    finally:
        conn.close()


# --- active-save selection -------------------------------------------------------

def _active_file(settings: ExtractSettings) -> Path:
    return settings.data_dir / "active_save.txt"


def get_active_key(settings: ExtractSettings) -> str | None:
    f = _active_file(settings)
    return f.read_text(encoding="utf-8").strip() or None if f.exists() else None


def set_active_key(settings: ExtractSettings, key: str) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    _active_file(settings).write_text(key, encoding="utf-8")


def resolve_active_save(settings: ExtractSettings, folder: Path | None = None) -> Path | None:
    """The user-selected save if still present, else the newest. None if the folder is empty."""
    folder = folder or resolve_save_path(settings.save_path)
    saves = sorted(folder.glob("*.xml.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not saves:
        return None
    key = get_active_key(settings)
    if key is not None:
        for p in saves:
            if save_key(p) == key:
                return p
    return saves[0]


def save_path_for_key(settings: ExtractSettings, key: str) -> Path | None:
    """The save file whose `save_key` matches `key`, or None if absent."""
    try:
        folder = resolve_save_path(settings.save_path)
    except FileNotFoundError:
        return None
    for p in folder.glob("*.xml.gz"):
        if save_key(p) == key:
            return p
    return None


def ensure_active_dynamic_db(settings: ExtractSettings) -> Path:
    """Resolve the active save's DB path, creating an empty schema'd DB if it's missing.

    Resilient: if no save folder/saves exist, returns a shared empty DB so the read-only
    API can still ATTACH static and serve static-only endpoints.
    """
    _ensure_seed_schema(settings)
    try:
        save = resolve_active_save(settings)
    except FileNotFoundError:
        save = None
    db = dynamic_db_path(settings, save) if save is not None else settings.dynamic_dir / _FALLBACK_DB
    if not db.exists():
        apply_schema(settings.data_dir, "dynamic", db_path=db)
    return db


def _ensure_seed_schema(settings: ExtractSettings) -> None:
    """Apply the (empty) seed schema if seed.db is missing or lacks its tables.

    Endpoints that read `seed.*` would otherwise 500 against an empty/absent seed.db
    (e.g. before `rebuild-static` has ever run). Never wipes a populated seed: if the
    tables already exist we leave them alone, so `rebuild-static` data survives.
    """
    seed_path = settings.data_dir / "seed.db"
    if seed_path.exists():
        conn = sqlite3.connect(seed_path)
        try:
            has_tables = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='faction_relations'"
            ).fetchone()
        finally:
            conn.close()
        if has_tables is not None:
            return
    apply_schema(settings.data_dir, "seed")
