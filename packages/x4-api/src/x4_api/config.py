"""API runtime settings.

Extraction concerns (install/save paths, save resolution) live in
`x4_extract.config`. This module only adds the server runtime fields and pins
`data_dir` to the repo root's data/ folder — independent of the X4C_DATA_DIR
env var which may be empty in some environments.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from x4_extract.config import ExtractSettings

# Project root: packages/x4-api/src/x4_api/config.py → parents[4] = repo root.
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(ExtractSettings):
    host: str = "127.0.0.1"
    port: int = 8765

    @model_validator(mode="after")
    def _pin_data_dir(self) -> "Settings":
        """Always use the repo root's data/ folder, ignoring the env var."""
        self.data_dir = (_PROJECT_ROOT / "data").resolve()
        return self


settings = Settings()  # raises on first import if required env vars are missing
