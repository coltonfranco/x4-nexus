"""API runtime settings.

Extraction concerns (install/save paths, save resolution) live in
`x4_extract.config`. This module only adds the server runtime fields and pins
`data_dir` to this package's layout.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from x4_extract.config import ExtractSettings


class Settings(ExtractSettings):
    # Override data_dir default with a path relative to this package's layout.
    data_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "data",
        description="Where static.db, dynamic/, extracted XML cache, and icons live.",
    )
    host: str = "127.0.0.1"
    port: int = 8765


settings = Settings()  # raises on first import if required env vars are missing
