"""EXEMPLAR tests for config path resolution.

Demonstrates the patterns expected for all unit tests:
    * Arrange-act-assert with no shared mutable state.
    * Filesystem effects use tmp_path, never the real Documents folder.
    * Error paths assert on the message text the user will actually see.
"""

from __future__ import annotations

import gzip
from pathlib import Path

import pytest
from x4_extract.config import latest_save, resolve_save_path


def test_resolve_save_path_uses_configured_when_valid(tmp_path: Path) -> None:
    save_folder = tmp_path / "save"
    save_folder.mkdir()
    (save_folder / "save_001.xml.gz").write_bytes(gzip.compress(b"<savegame/>"))

    assert resolve_save_path(save_folder) == save_folder


def test_resolve_save_path_errors_when_configured_missing(tmp_path: Path) -> None:
    missing = tmp_path / "nonexistent"

    with pytest.raises(FileNotFoundError, match="does not exist"):
        resolve_save_path(missing)


def test_resolve_save_path_errors_when_no_xml_gz(tmp_path: Path) -> None:
    save_folder = tmp_path / "save"
    save_folder.mkdir()
    (save_folder / "readme.txt").write_text("oops")

    with pytest.raises(FileNotFoundError, match="no \\*\\.xml\\.gz"):
        resolve_save_path(save_folder)


def test_latest_save_returns_most_recently_modified(tmp_path: Path) -> None:
    older = tmp_path / "save_001.xml.gz"
    newer = tmp_path / "save_002.xml.gz"
    older.write_bytes(b"")
    newer.write_bytes(b"")
    import os
    import time

    past = time.time() - 60
    os.utime(older, (past, past))

    assert latest_save(tmp_path) == newer
