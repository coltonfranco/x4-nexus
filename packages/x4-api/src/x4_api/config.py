"""API runtime settings.

Extraction concerns (install/save paths, save resolution) live in
`x4_extract.config`. This module adds the server runtime fields and two things a
packaged desktop build needs that the bare extraction settings don't:

1. A **persisted JSON config source** (``x4_api.appdata``) layered *below* env vars
   and ``.env`` — so the first-run wizard's folder choices survive a restart while
   the dev's ``.env`` workflow still wins.
2. A **data_dir fallback** to the per-user app-data directory when not running from
   a source checkout (a packaged exe has no repo ``data/`` folder).

`install_path` is optional (inherited from ExtractSettings) so the server can boot
with nothing configured and serve the setup API; see ``x4_api.api.v1.setup``.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource
from x4_extract.config import ExtractSettings

from x4_api import appdata

# Project root: packages/x4-api/src/x4_api/config.py → parents[4] = repo root.
# In a packaged build this path won't contain a data/ folder, which is the signal
# to fall back to app-data (see _pin_data_dir).
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


class _JsonConfigSource(PydanticBaseSettingsSource):
    """Settings source backed by the persisted app-data config.json.

    Lowest priority among the real sources: only fills fields that env / .env / the
    constructor didn't already provide.
    """

    def get_field_value(self, field, field_name):  # type: ignore[no-untyped-def]
        # Not used — we return the whole mapping from __call__ instead.
        return None, field_name, False

    def __call__(self) -> dict[str, object]:
        return dict(appdata.read_config())


class Settings(ExtractSettings):
    host: str = "127.0.0.1"
    port: int = 8765
    background_refresh: bool = Field(
        default=True,
        description="Run the save-file watcher inside the API process so the active save's "
        "dynamic DB stays fresh automatically. Disable to manage ingestion externally.",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Priority high→low: constructor args, env vars, .env, persisted config.json,
        # secrets. The wizard writes config.json; the dev's .env still overrides it.
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            _JsonConfigSource(settings_cls),
            file_secret_settings,
        )

    @model_validator(mode="after")
    def _pin_data_dir(self) -> Settings:
        """Resolve data_dir when it wasn't explicitly configured.

        An empty/absent X4C_DATA_DIR resolves (via ExtractSettings) to the current
        working directory, which isn't where data/ lives. In that case prefer the
        repo's data/ folder when present (source checkout), otherwise the per-user
        app-data dir (packaged build). An explicitly configured data_dir — a real env
        value, or a test passing data_dir=tmp — is honored untouched.
        """
        if self.data_dir == Path.cwd():
            repo_data = (_PROJECT_ROOT / "data").resolve()
            self.data_dir = repo_data if repo_data.exists() else (appdata.app_data_dir() / "data")
        return self


def is_configured(settings: Settings) -> bool:
    """True once a game install folder is set — the minimum to run extraction."""
    return settings.install_path is not None


def static_db_ready(settings: Settings) -> bool:
    """True when static.db exists and has been populated (wares is a core table).

    The setup gate uses this: the main app requires a populated static DB; save data
    builds on top of it.
    """
    import sqlite3

    static_path = settings.data_dir / "static.db"
    if not static_path.exists():
        return False
    try:
        conn = sqlite3.connect(f"file:{static_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return False
    try:
        row = conn.execute("SELECT COUNT(*) FROM wares").fetchone()
        return bool(row and row[0] > 0)
    except sqlite3.OperationalError:
        return False
    finally:
        conn.close()


settings = Settings()  # never raises now — install_path is optional until setup completes
