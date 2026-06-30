"""Icon URL resolution using the generated manifest."""

from __future__ import annotations

import json

from x4_api.config import settings

ICON_BASE = "/static/icons"

# mtime-based cache so icon rebuilds (e.g. during first-run setup) are picked up
# without a restart.  A permanent lru_cache would poison itself with {} when the
# manifest file doesn't exist yet, and never recover.
_manifest_mtime: float | None = None
_manifest_cache: dict[str, dict[str, str]] | None = None


def _load_manifest() -> dict[str, dict[str, str]]:
    global _manifest_mtime, _manifest_cache

    manifest_path = settings.data_dir / "icons" / "manifest.json"
    if not manifest_path.exists():
        return {}

    try:
        mtime = manifest_path.stat().st_mtime
    except OSError:
        return _manifest_cache if _manifest_cache is not None else {}

    # Return cached data when the file hasn't changed since the last read.
    if _manifest_mtime == mtime and _manifest_cache is not None:
        return _manifest_cache

    try:
        with manifest_path.open("r", encoding="utf-8") as f:
            data: dict[str, dict[str, str]] = json.load(f)
    except Exception:
        # Partial / corrupt write (e.g. icon rebuild in progress) — keep the
        # previous good cache when available, otherwise fall back to empty.
        return _manifest_cache if _manifest_cache is not None else {}

    _manifest_mtime = mtime
    _manifest_cache = data
    return data


def get_icon_url(logical_id: str | None) -> str | None:
    """Return the static URL for a logical icon ID."""
    if not logical_id:
        return None
        
    manifest = _load_manifest()
    
    # If the icon exists in our manifest, use its exact generated path
    if logical_id in manifest and "path" in manifest[logical_id]:
        return f"{ICON_BASE}/{manifest[logical_id]['path']}"
        
    # Fallback if manifest is missing or icon wasn't extracted
    category = logical_id.split("_", 1)[0] if "_" in logical_id else "misc"
    return f"{ICON_BASE}/{category}/{logical_id}.png"


def get_ware_icon_url(ware_id: str, icon_path: str | None, tags: str | None = None) -> str | None:
    """Resolve icon URL for a ware.

    Uses the stored ``icon_path`` (set for wares whose icons were extracted from
    the game's asset catalog).  When that field is ``NULL``, falls back to
    tag-based heuristics for ware categories whose icon filenames follow a known
    convention (e.g. ``paintmod_XXXX`` → ``paintmods/paintmod_XXXX.png``).
    """
    if icon_path:
        return get_icon_url(icon_path)
    if not tags:
        return None
    tags_lower = tags.lower()
    if "paintmod" in tags_lower:
        return f"{ICON_BASE}/paintmods/{ware_id}.png"
    return None
