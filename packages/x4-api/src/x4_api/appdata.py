"""App-data directory and runtime config persistence.

A packaged desktop build has no `.env` and no environment variables — the user
picks their game folders in the first-run wizard, and those choices must persist
across restarts. They live in a JSON file under a per-user app-data directory:

  Windows : %APPDATA%/x4-companion/config.json
  other   : ~/.x4-companion/config.json

This is the lowest-priority settings source (see `x4_api.config`): an explicit
env var or `.env` (the dev workflow) always wins over the persisted file.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

_APP_NAME = "x4-companion"


def app_data_dir() -> Path:
    """Per-user writable directory for this app's config + generated data."""
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else Path.home() / f".{_APP_NAME}"
    return (base / _APP_NAME if appdata else base).resolve()


def config_file() -> Path:
    """Path to the persisted runtime config (may not exist yet)."""
    return app_data_dir() / "config.json"


def read_config() -> dict[str, str]:
    """Return the persisted config, or an empty dict if absent/unreadable.

    Only string-valued path fields are kept (`install_path`, `save_path`); anything
    else is ignored so a malformed file can never inject unexpected settings.
    """
    try:
        raw = json.loads(config_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key in ("install_path", "save_path"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value
    return out


def write_config(*, install_path: str, save_path: str | None) -> None:
    """Persist the wizard's folder choices. Creates the app-data dir if needed."""
    path = config_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, str] = {"install_path": install_path}
    if save_path:
        payload["save_path"] = save_path
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
