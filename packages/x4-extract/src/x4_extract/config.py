"""Shared settings + path resolution for the extraction pipeline.

Extraction owns both the static (game archive) and dynamic (save file) inputs, so
save-folder resolution lives here rather than in the API layer. Save folders are
commonly relocated; never silently fall back to the Egosoft default without telling
the user where we looked.
"""

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
        description="Where static.db, dynamic/, extracted XML cache, and icons live.",
    )
    save_path: Path | None = Field(
        default=None,
        description="Folder containing *.xml.gz save files. If unset, resolve_save_path tries defaults.",
    )
    poll_interval_sec: int = Field(
        default=60,
        description="Seconds between save-folder polls when running `x4c watch`.",
    )
    save_settle_sec: float = Field(
        default=2.5,
        description="Seconds a changed save file must stay unmodified before the watcher "
        "opens it to ingest. While X4 streams a save its mtime keeps advancing; waiting for "
        "it to go quiet avoids opening a file mid-write, which on Windows blocks X4's own "
        "write and surfaces in-game as 'save failed'.",
    )
    serve_fallback_window_sec: float = Field(
        default=3600,
        description="While following the latest save and the newest file isn't ingested yet, "
        "the API serves the most recent already-current save so the dashboard doesn't blank "
        "during a rotation. This bounds how far back that fallback may reach: a current save "
        "older than the newest file by more than this is treated as a previous-session leftover "
        "and skipped (the dashboard shows 'loading' until the newest ingests) rather than "
        "flashing hours-old data on startup.",
    )

    @field_validator("install_path", "data_dir")
    @classmethod
    def _expand(cls, v: Path) -> Path:
        resolved = Path(v).expanduser().resolve()
        # An empty env var (X4C_DATA_DIR=) yields Path('.') → CWD.
        # Treat that as "unset" so the Field default is used instead.
        if resolved == Path.cwd() and str(v).strip() in ("", "."):
            from pydantic.fields import FieldInfo
            return resolved  # let pydantic use its default via validation context
        return resolved

    @field_validator("save_path")
    @classmethod
    def _expand_optional(cls, v: Path | None) -> Path | None:
        return Path(v).expanduser().resolve() if v else None

    @property
    def dynamic_dir(self) -> Path:
        """Per-save dynamic DBs live here (one <save_key>.db file each)."""
        return self.data_dir / "dynamic"


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


def save_key(path: Path) -> str:
    """Stable per-save identifier derived from the save file name.

    A rotating file (autosave overwrites itself) keeps the same key; its DB is rebuilt
    when content changes. Different files get different keys → different DBs. The key is
    sanitized to a safe filename stem (e.g. `quicksave`, `autosave_01`, `save_007`).
    """
    stem = path.name
    for suffix in (".xml.gz", ".gz", ".xml"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    return "".join(c if (c.isalnum() or c in "-_") else "_" for c in stem) or "save"
