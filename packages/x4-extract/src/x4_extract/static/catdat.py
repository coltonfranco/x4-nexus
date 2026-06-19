"""Read X4's .cat/.dat archive pairs without unpacking the whole thing.

A .cat is a plain-text index — one entry per line: `<path> <size> <mtime> <md5>`.
The .dat is the concatenated raw bytes for those entries in declaration order. Offsets
are cumulative, so reading a single inner file is a single byte-range read.

DLC and workshop content lives in `extensions/<name>/ext_NN.cat` next to `ext_NN.dat`;
the format is identical.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class CatEntry:
    """One file inside a .dat, located by byte range."""

    path: str            # POSIX-style virtual path, e.g. "libraries/wares.xml"
    size: int
    offset: int          # absolute byte offset into the .dat
    mtime: int
    md5: str
    dat_path: Path       # the .dat file this entry's bytes live in


def iter_cat(cat_path: Path) -> Iterator[CatEntry]:
    """Yield every entry in a .cat in declaration order."""
    dat_path = cat_path.with_suffix(".dat")
    offset = 0
    with cat_path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            # Last whitespace tokens are size/mtime/md5; path may contain spaces.
            parts = line.rstrip("\n").rsplit(" ", 3)
            if len(parts) != 4:
                continue
            path, size_s, mtime_s, md5 = parts
            size = int(size_s)
            yield CatEntry(
                path=path,
                size=size,
                offset=offset,
                mtime=int(mtime_s),
                md5=md5,
                dat_path=dat_path,
            )
            offset += size


def build_index(cat_paths: list[Path]) -> dict[str, CatEntry]:
    """Merge multiple .cat indexes; later cats override earlier ones (mod load order).

    Pass base game .cat files first, then DLC, then workshop. The returned mapping is
    path → most-recently-declared entry, matching X4's runtime resolution.
    """
    index: dict[str, CatEntry] = {}
    for cat in cat_paths:
        for entry in iter_cat(cat):
            index[entry.path] = entry
    return index


def read_entry(entry: CatEntry, *, verify_hash: bool = False) -> bytes:
    """Read a single archived file's raw bytes via byte-range from the .dat."""
    with entry.dat_path.open("rb") as f:
        f.seek(entry.offset)
        data = f.read(entry.size)
    if len(data) != entry.size:
        raise OSError(
            f"Short read for {entry.path}: expected {entry.size}, got {len(data)} "
            f"from {entry.dat_path}"
        )
    if verify_hash and entry.md5:
        actual = hashlib.md5(data).hexdigest()
        if actual != entry.md5:
            raise ValueError(
                f"Hash mismatch for {entry.path}: cat={entry.md5} actual={actual}"
            )
    return data


def discover_cats(install_path: Path | None) -> list[Path]:
    """Return all .cat paths in canonical load order: base → DLC → workshop.

    `_sig.cat` files are signature variants used by the game's integrity check;
    they are excluded because they replay the same paths.

    `install_path` may be None when the app is still unconfigured; callers treat an
    empty list as "no game files found" and abort, so we return [] rather than raise.
    """
    if install_path is None:
        return []
    base = sorted(
        (p for p in install_path.glob("*.cat") if not p.stem.endswith("_sig")),
        key=lambda p: int(p.stem) if p.stem.isdigit() else 0,
    )
    dlc = sorted(
        p
        for p in install_path.glob("extensions/ego_dlc_*/ext_*.cat")
        if not p.stem.endswith("_sig")
    )
    workshop = sorted(
        p
        for p in install_path.glob("extensions/ws_*/ext_*.cat")
        if not p.stem.endswith("_sig")
    )
    return [*base, *dlc, *workshop]
