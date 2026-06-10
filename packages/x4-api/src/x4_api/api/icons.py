"""Icon URL resolution using the generated manifest."""

from __future__ import annotations

import json
from functools import lru_cache

from x4_api.config import settings

ICON_BASE = "/static/icons"

@lru_cache(maxsize=1)
def _load_manifest() -> dict[str, dict[str, str]]:
    manifest_path = settings.data_dir / "icons" / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        with manifest_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


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
