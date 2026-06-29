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
       c. File at a path not seen before: store as-is (DLC-unique assets).
  3. Workshop cats (extensions/ws_*/ext_NN.cat) — not yet supported, ignored.
"""

from __future__ import annotations

import copy
import logging
import sqlite3
import time

from lxml import etree

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema
from x4_extract.static import catdat

log = logging.getLogger(__name__)

# Top-level directories that are runtime-only and add no static data value.
# aiscripts is handled specially: we only extract <order> definitions from it.
EXCLUDE_DIRS = {"md", "cutscenes", "fx", "ui"}


def _log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"\033[90m{ts}\033[0m  {msg}", flush=True)

def _elapsed(start: float) -> str:
    dt = time.monotonic() - start
    if dt < 1.0:
        c = "32"
    elif dt < 10.0:
        c = "33"
    else:
        c = "31"
    return f"\033[{c}m{dt:.1f}s\033[0m"


def run_crawler(settings: ExtractSettings) -> None:
    """Crawl catalogs and dump patched/merged XMLs to the datalake."""
    cats = catdat.discover_cats(settings.install_path)
    if not cats:
        _log(f"No catalog files found at {settings.install_path}")
        return

    base_cats = [c for c in cats if "extensions" not in c.as_posix()]
    dlc_cats  = [c for c in cats if "extensions" in c.as_posix() and "ws_" not in c.as_posix()]
    _log(f"Found {len(base_cats)} base + {len(dlc_cats)} DLC catalogs")

    # ------------------------------------------------------------------
    # Phase 1: Base game — last cat wins (update cats override earlier ones)
    # ------------------------------------------------------------------
    base_entries: dict[str, catdat.CatEntry] = {}
    for cat in base_cats:
        count = 0
        for entry in catdat.iter_cat(cat):
            if _keep(entry.path):
                base_entries[entry.path] = entry   # last-wins
                count += 1
        _log(f"  {cat.stem}.cat -> {count} XML entries")

    _log(f"Base game: {len(base_entries)} unique XML files after last-cat-wins merge.")

    # ------------------------------------------------------------------
    # Phase 2: DLC — diff-patch or additive merge on top of base
    # ------------------------------------------------------------------
    # resolved holds bytes for any file that was patched or merged; files
    # only in base_entries are read lazily from the .dat when writing.
    resolved: dict[str, bytes] = {}
    dlc_patched = 0
    dlc_new = 0

    for cat in dlc_cats:
        dlc_name = cat.parent.name if cat.parent else cat.stem
        cat_patched = 0
        cat_new = 0
        for entry in catdat.iter_cat(cat):
            if not _keep(entry.path):
                continue

            dlc_bytes = catdat.read_entry(entry)
            existing = resolved.get(entry.path)

            if existing is None and entry.path not in base_entries:
                # New DLC-unique path — store as-is.
                resolved[entry.path] = dlc_bytes
                cat_new += 1
                continue

            # File exists in base or was already patched by an earlier DLC.
            if existing is None:
                existing = catdat.read_entry(base_entries[entry.path])

            if _is_diff(dlc_bytes):
                try:
                    resolved[entry.path] = _apply_diff(existing, dlc_bytes)
                    cat_patched += 1
                except Exception as exc:
                    log.warning("diff apply failed for %s from %s: %s", entry.path, cat.name, exc)
            else:
                try:
                    resolved[entry.path] = _merge_additive(existing, dlc_bytes)
                    cat_patched += 1
                except Exception as exc:
                    log.warning("merge failed for %s from %s: %s", entry.path, cat.name, exc)

        _log(f"  {dlc_name}: {cat_patched} patched/merged, {cat_new} new files")
        dlc_patched += cat_patched
        dlc_new += cat_new

    _log(f"DLC total: {dlc_patched} files patched/merged, {dlc_new} new files added.")

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

        top_dir  = path.split("/")[0] if "/" in path else ""
        filename = path.rsplit("/", 1)[-1]

        if top_dir == "aiscripts":
            try:
                # We only want <order> elements to keep the database size down
                root = etree.fromstring(content_bytes)
                orders = root.xpath("//order")
                if not orders:
                    continue
                new_root = etree.Element("aiscript")
                for o in orders:
                    new_root.append(o)
                content_bytes = etree.tostring(new_root, encoding="utf-8")
            except Exception:
                continue

        content_str = content_bytes.decode("utf-8", errors="replace")

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
    _log(f"Datalake populated: {count} XML files.")


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

    # Post-process: deduplicate root children by id.  Some DLC <diff> files
    # add elements whose id already exists in the base tree (e.g. a DLC that
    # ships a factions.xml <diff> that re-adds the terran faction with updated
    # relations).  Merging sub-elements preserves the DLC additions without
    # creating a duplicate row.
    _dedup_children_by_id(base_root)

    return etree.tostring(base_root, encoding="unicode").encode("utf-8")


def _dedup_children_by_id(parent: etree._Element) -> None:
    """Merge duplicate immediate children of *parent* that share an ``id`` attribute.

    When two children have the same ``id``, the second occurrence's attributes
    overwrite the first, and its sub-elements are appended into the first.
    The duplicate (second) child is then removed from *parent*.
    """
    seen: dict[str, etree._Element] = {}
    to_remove: list[etree._Element] = []
    for child in parent:
        if callable(child.tag):
            continue
        cid = child.get("id")
        if cid is None:
            continue
        if cid in seen:
            # Duplicate — merge into the first occurrence.
            existing = seen[cid]
            for attr, val in child.attrib.items():
                existing.set(attr, val)
            for sub in child:
                if callable(sub.tag):
                    continue
                existing.append(copy.deepcopy(sub))
            to_remove.append(child)
        else:
            seen[cid] = child
    for child in to_remove:
        parent.remove(child)


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
    """Merge DLC root children into the base tree.

    For each DLC root child:
    - If it has an ``id`` attribute that matches an existing base child's ``id``,
      merge its sub-elements and attributes into the existing child (instead of
      creating a duplicate).  Attributes present in the DLC child overwrite the
      base; attributes only in the base are kept.
    - Otherwise, append it as a genuinely new entry.
    - Children without an ``id`` attribute are always appended (no duplicate
      detection possible).
    """
    base_root = etree.fromstring(base_bytes)
    dlc_root  = etree.fromstring(dlc_bytes)

    # Build an id → element lookup over the base root children
    base_by_id: dict[str, etree._Element] = {}
    for el in base_root:
        if callable(el.tag):
            continue
        eid = el.get("id")
        if eid is not None:
            base_by_id[eid] = el

    for child in list(dlc_root):
        if callable(child.tag):
            continue

        child_id = child.get("id")
        if child_id is not None and child_id in base_by_id:
            # Duplicate — merge sub-elements and attributes into the existing entry.
            existing = base_by_id[child_id]

            # Merge attributes: DLC wins where present, base kept otherwise.
            for attr, val in child.attrib.items():
                existing.set(attr, val)

            # Merge sub-elements: append all DLC children into the existing
            # base entry.  This may create duplicate sub-elements (e.g. two
            # identical <relation> children).  Extractors are responsible for
            # deduplicating their output in Python before writing to SQLite.
            for sub in child:
                if callable(sub.tag):
                    continue
                existing.append(copy.deepcopy(sub))
        else:
            # New element — append as before.
            base_root.append(copy.deepcopy(child))

    return etree.tostring(base_root, encoding="unicode").encode("utf-8")


def _flush(conn: sqlite3.Connection, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT INTO raw_files (filepath, directory, filename, content) "
        "VALUES (:filepath, :directory, :filename, :content)",
        rows,
    )
