"""Environment + path resolution.

Save folders are commonly relocated; never silently fall back to the Egosoft default
without telling the user where we looked. The `doctor` CLI exercises every resolver
branch.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
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
    save_path: Path | None = Field(
        default=None,
        description="Folder containing *.xml.gz save files. If unset, resolve() tries defaults.",
    )
    data_dir: Path = Field(
        # Resolves to packages/x4-api/data/ when running from the workspace.
        default=Path(__file__).resolve().parents[2] / "data",
        description="Where static.db, dynamic.db, extracted XML cache, and icons live.",
    )
    host: str = "127.0.0.1"
    port: int = 8765
    poll_interval_sec: int = 60

    @field_validator("install_path", "data_dir")
    @classmethod
    def _expand(cls, v: Path) -> Path:
        return Path(v).expanduser().resolve()

    @field_validator("save_path")
    @classmethod
    def _expand_optional(cls, v: Path | None) -> Path | None:
        return Path(v).expanduser().resolve() if v else None


_DEFAULT_SAVE_CANDIDATES = (
    Path.home() / "Documents" / "Egosoft" / "X4",
    Path("C:/Program Files (x86)/Steam/userdata"),
)


def resolve_save_path(configured: Path | None) -> Path:
    """Return a save folder containing *.xml.gz files, or raise with a useful message.

    Priority:
      1. X4C_SAVE_PATH env var (authoritative — no fallback if it's set but empty).
      2. Egosoft default: ~/Documents/Egosoft/X4/<profile-id>/save/.
      3. Steam Cloud overrides under userdata/<steam_id>/392160/remote/.
    """
    if configured is not None:
        if not configured.exists():
            raise FileNotFoundError(
                f"X4C_SAVE_PATH={configured} does not exist. "
                "Set it to the folder directly containing your *.xml.gz save files."
            )
        if not any(configured.glob("*.xml.gz")):
            raise FileNotFoundError(
                f"X4C_SAVE_PATH={configured} contains no *.xml.gz files. "
                "Check you pointed at the inner save/ folder, not the profile folder."
            )
        return configured

    tried: list[str] = []
    for base in _DEFAULT_SAVE_CANDIDATES:
        if not base.exists():
            tried.append(f"  {base} (not found)")
            continue
        for profile in base.iterdir():
            candidate = profile / "save"
            if candidate.is_dir() and any(candidate.glob("*.xml.gz")):
                return candidate
            tried.append(f"  {candidate} (no *.xml.gz)")

    raise FileNotFoundError(
        "Could not auto-detect an X4 save folder. Set X4C_SAVE_PATH explicitly.\n"
        "Tried:\n" + "\n".join(tried)
    )


def latest_save(folder: Path) -> Path:
    """Most recently modified *.xml.gz in `folder`."""
    saves = sorted(folder.glob("*.xml.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not saves:
        raise FileNotFoundError(f"No *.xml.gz in {folder}")
    return saves[0]


settings = Settings()  # raises on first import if required env vars are missing
