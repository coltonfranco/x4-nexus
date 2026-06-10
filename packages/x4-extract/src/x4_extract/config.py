"""Shared settings for the extraction pipeline."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ExtractSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="X4C_",
        extra="ignore",
    )

    install_path: Path = Field(
        ...,
        description="Folder containing X4.exe and the .cat/.dat archives.",
    )
    data_dir: Path = Field(
        default=Path("data"),
        description="Where static.db, dynamic.db, extracted XML cache, and icons live.",
    )

    @field_validator("install_path", "data_dir")
    @classmethod
    def _expand(cls, v: Path) -> Path:
        return Path(v).expanduser().resolve()
