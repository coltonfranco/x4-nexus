"""Raw datalake lookup helpers for static transforms."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


def _content_to_bytes(content: object) -> bytes:
    if isinstance(content, bytes):
        return content
    return str(content).encode("utf-8")


@dataclass(slots=True)
class CachedRawFiles:
    """In-memory raw file index for macro-heavy static transforms."""

    by_path: dict[str, bytes]
    by_path_lower: dict[str, bytes]
    by_filename_lower: dict[str, bytes]

    def get_path(self, path: str) -> bytes | None:
        if path in self.by_path:
            return self.by_path[path]
        lower = path.lower()
        if lower in self.by_path_lower:
            return self.by_path_lower[lower]
        if path.startswith("extensions/"):
            stripped = "/".join(path.split("/")[2:])
            if stripped in self.by_path:
                return self.by_path[stripped]
            stripped_lower = stripped.lower()
            if stripped_lower in self.by_path_lower:
                return self.by_path_lower[stripped_lower]
        return None

    def require_path(self, path: str) -> bytes:
        content = self.get_path(path)
        if content is None:
            raise KeyError(path)
        return content

    def require_name(self, name: str) -> bytes:
        key = f"{name}.xml".lower()
        if key in self.by_filename_lower:
            return self.by_filename_lower[key]
        raise KeyError(name)


@dataclass(slots=True)
class RawFileStore:
    """Read merged XML bytes from `raw_files`.

    `schema` is an internal SQLite schema alias such as `"raw"` when the datalake is
    attached to another connection.
    """

    conn: sqlite3.Connection
    schema: str | None = None

    @property
    def _table(self) -> str:
        return f"{self.schema}.raw_files" if self.schema else "raw_files"

    def get_path(self, filepath: str) -> bytes | None:
        row = self.conn.execute(
            f"SELECT content FROM {self._table} WHERE filepath = ? COLLATE NOCASE",
            (filepath,),
        ).fetchone()
        if row is None and filepath.startswith("extensions/"):
            stripped = "/".join(filepath.split("/")[2:])
            row = self.conn.execute(
                f"SELECT content FROM {self._table} WHERE filepath = ? COLLATE NOCASE",
                (stripped,),
            ).fetchone()
        return _content_to_bytes(row[0]) if row else None

    def require_path(self, filepath: str) -> bytes:
        content = self.get_path(filepath)
        if content is None:
            raise KeyError(filepath)
        return content

    def require_name(self, name: str) -> bytes:
        filename = f"{name}.xml"
        row = self.conn.execute(
            f"SELECT content FROM {self._table} WHERE filename = ? COLLATE NOCASE",
            (filename,),
        ).fetchone()
        if row:
            return _content_to_bytes(row[0])
        raise KeyError(name)

    def preload(self) -> CachedRawFiles:
        rows = self.conn.execute(f"SELECT filepath, content FROM {self._table}").fetchall()
        by_path = {str(r[0]): _content_to_bytes(r[1]) for r in rows}
        by_path_lower = {k.lower(): v for k, v in by_path.items()}
        by_filename_lower: dict[str, bytes] = {}
        for path, content in by_path.items():
            filename = path.rsplit("/", 1)[-1]
            by_filename_lower.setdefault(filename.lower(), content)
        return CachedRawFiles(by_path, by_path_lower, by_filename_lower)
