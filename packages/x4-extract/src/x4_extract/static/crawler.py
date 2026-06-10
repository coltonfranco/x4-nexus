"""Datalake crawler. Extracts raw XML files into the raw_files SQLite table.

Resolution order (mirrors X4 runtime):
  1. Base game cats (01.cat … NN.cat) — later cat wins for the same path, so
     update cats that ship with patches correctly override earlier versions.
  2. DLC cats (extensions/ego_dlc_*/ext_NN.cat) in sorted order — two cases:
       a. File starts with <diff>: apply add/replace/remove patch operations
          against the current resolved bytes for that path.
       b. Full standalone file at a path that already exists: merge root-level
          child elements into the existing tree (loadouts, region_definitions,
          index/macros, etc. — each DLC contributes its own set, no overlap).
       c. File at a new path not seen before: store as-is (DLC-unique assets).
  3. Workshop cats (extensions/ws_*/ext_NN.cat) — not yet supported, ignored.
"""

from __future__ import annotations

import copy
import logging
import sqlite3

from lxml import etree

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema
from x4_extract.static import catdat

log = logging.getLogger(__name__)

# Top-level directories that are runtime-only and add no static data value.
EXCLUDE_DIRS = {"aiscripts", "md", "cutscenes", "fx", "ui"}


def run_crawler(settings: ExtractSettings) -> None:
    """Crawl catalogs and dump patched/merged XMLs to the datalake."""
    cats = catdat.discover_cats(settings.install_path)
    if not cats:
        print(f"No catalog files found at {settings.install_path}")
        return

    base_cats = [c for c in cats if "extensions" not in c.as_posix()]
    dlc_cats  = [c for c in cats if "extensions" in c.as_posix()]

    # ------------------------------------------------------------------
    # Phase 1: Base game — last cat wins (update cats override earlier ones)
    # ------------------------------------------------------------------
    base_entries: dict[str, catdat.CatEntry] = {}
    for cat in base_cats:
        for entry in catdat.iter_cat(cat):
            if _keep(entry.path):
                base_entries[entry.path] = entry   # last-wins

    print(f"Base game: {len(base_entries)} XML files.")

    # ------------------------------------------------------------------
    # Phase 2: DLC — diff-patch or additive merge on top of base
    # ------------------------------------------------------------------
    # resolved holds bytes for any file that was patched or merged; files
    # only in base_entries are read lazily from the .dat when writing.
    resolved: dict[str, bytes] = {}

    for cat in dlc_cats:
        for entry in catdat.iter_cat(cat):
            if not _keep(entry.path):
                continue

            dlc_bytes = catdat.read_entry(entry)
            existing = resolved.get(entry.path)

            if existing is None and entry.path not in base_entries:
                # New DLC-unique path — store as-is.
                resolved[entry.path] = dlc_bytes
                continue

            # File exists in base or was already patched by an earlier DLC.
            if existing is None:
                existing = catdat.read_entry(base_entries[entry.path])

            if _is_diff(dlc_bytes):
                try:
                    resolved[entry.path] = _apply_diff(existing, dlc_bytes)
                except Exception as exc:
                    log.warning("diff apply failed for %s from %s: %s", entry.path, cat.name, exc)
            else:
                try:
                    resolved[entry.path] = _merge_additive(existing, dlc_bytes)
                except Exception as exc:
                    log.warning("merge failed for %s from %s: %s", entry.path, cat.name, exc)

    dlc_new   = sum(1 for p in resolved if p not in base_entries)
    dlc_patched = len(resolved) - dlc_new
    print(f"DLC: {dlc_patched} files patched/merged, {dlc_new} new files added.")

    # ------------------------------------------------------------------
    # Phase 3: Write everything to raw.db
    # ------------------------------------------------------------------
    apply_schema(settings.data_dir, "raw")
    db_conn = sqlite3.connect(settings.data_dir / "raw.db")
    db_conn.row_factory = sqlite3.Row
    db_conn.execute("DELETE FROM raw_files")

    all_paths = list(base_entries) + [p for p in resolved if p not in base_entries]
    rows_to_insert: list[dict] = []

    for path in all_paths:
        if path in resolved:
            content_bytes = resolved[path]
        else:
            try:
                content_bytes = catdat.read_entry(base_entries[path])
            except Exception as exc:
                log.warning("Failed to read %s: %s", path, exc)
                continue

        content_str = content_bytes.decode("utf-8", errors="replace")
        top_dir  = path.split("/")[0] if "/" in path else ""
        filename = path.rsplit("/", 1)[-1]

        rows_to_insert.append({
            "filepath":  path,
            "directory": top_dir,
            "filename":  filename,
            "content":   content_str,
        })

        if len(rows_to_insert) >= 1000:
            _flush(db_conn, rows_to_insert)
            rows_to_insert.clear()

    if rows_to_insert:
        _flush(db_conn, rows_to_insert)

    db_conn.commit()

    count = db_conn.execute("SELECT COUNT(*) FROM raw_files").fetchone()[0]
    print(f"Datalake populated: {count} XML files.")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _keep(path: str) -> bool:
    """Return True for XML files outside the excluded runtime directories."""
    if not path.endswith(".xml"):
        return False
    top_dir = path.split("/")[0] if "/" in path else ""
    return top_dir not in EXCLUDE_DIRS


def _is_diff(data: bytes) -> bool:
    return b"<diff" in data


def _apply_diff(base_bytes: bytes, diff_bytes: bytes) -> bytes:
    """Apply an X4 <diff> patch document to base_bytes and return the result."""
    base_root = etree.fromstring(base_bytes)
    diff_root = etree.fromstring(diff_bytes)

    for op in diff_root:
        if callable(op.tag):   # lxml Comment / PI nodes
            continue

        sel    = op.get("sel", "")
        silent = op.get("silent") == "1"

        try:
            matches = base_root.xpath(sel)
        except etree.XPathEvalError as exc:
            if not silent:
                log.debug("XPath error sel=%r: %s", sel, exc)
            continue

        if not matches:
            if not silent:
                log.debug("No match for sel=%r", sel)
            continue

        for target in matches:
            if not isinstance(target, etree._Element):
                # Attribute or text node — not something we modify for static data.
                continue
            if op.tag == "add":
                _op_add(target, op)
            elif op.tag == "replace":
                _op_replace(target, op)
            elif op.tag == "remove":
                _op_remove(target, op)

    return etree.tostring(base_root, encoding="unicode").encode("utf-8")


def _op_add(target: etree._Element, op: etree._Element) -> None:
    pos = op.get("pos", "append")
    children = [copy.deepcopy(c) for c in op if not callable(c.tag)]

    if pos == "append":
        for child in children:
            target.append(child)
    elif pos == "prepend":
        for i, child in enumerate(children):
            target.insert(i, child)
    elif pos in ("after", "before"):
        parent = target.getparent()
        if parent is None:
            return
        idx = list(parent).index(target)
        if pos == "after":
            idx += 1
        for i, child in enumerate(children):
            parent.insert(idx + i, child)


def _op_replace(target: etree._Element, op: etree._Element) -> None:
    parent = target.getparent()
    if parent is None:
        return
    idx = list(parent).index(target)
    parent.remove(target)
    for i, child in enumerate(op):
        if callable(child.tag):
            continue
        parent.insert(idx + i, copy.deepcopy(child))


def _op_remove(target: etree._Element, _op: etree._Element) -> None:
    parent = target.getparent()
    if parent is not None:
        parent.remove(target)


def _merge_additive(base_bytes: bytes, dlc_bytes: bytes) -> bytes:
    """Append DLC root children into the base tree.

    Used for files where each DLC contributes its own standalone content at
    the same virtual path (loadouts.xml, region_definitions.xml,
    index/macros.xml, etc.) with no overlap with the base game set.
    """
    base_root = etree.fromstring(base_bytes)
    dlc_root  = etree.fromstring(dlc_bytes)

    for child in list(dlc_root):
        if callable(child.tag):
            continue
        base_root.append(copy.deepcopy(child))

    return etree.tostring(base_root, encoding="unicode").encode("utf-8")


def _flush(conn: sqlite3.Connection, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT INTO raw_files (filepath, directory, filename, content) "
        "VALUES (:filepath, :directory, :filename, :content)",
        rows,
    )
