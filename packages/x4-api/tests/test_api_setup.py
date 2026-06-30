"""Smoke tests for the first-run setup endpoints + unconfigured-boot config layer."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api import appdata
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings


@pytest.fixture
def isolated_appdata(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect app-data (config.json) to a temp dir so tests never touch the real one."""
    appdir = tmp_path / "appdata"
    appdir.mkdir()
    monkeypatch.setattr(appdata, "app_data_dir", lambda: appdir)
    return appdir


@pytest.fixture
def settings(data_dir: Path) -> Settings:
    return Settings(install_path=None, data_dir=data_dir, save_path=None)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: settings
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


def _populate_static(data_dir: Path) -> None:
    conn = sqlite3.connect(data_dir / "static.db")
    conn.execute(
        "INSERT INTO wares (ware_id, name, volume) VALUES ('energycells', 'Energy Cells', 1.0)"
    )
    conn.commit()
    conn.close()


def test_status_needs_setup_when_unconfigured_and_empty(client: TestClient) -> None:
    resp = client.get("/api/v1/setup/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert body["install_path"] is None
    assert body["static_ready"] is False
    assert body["needs_setup"] is True
    assert body["init"]["stage"] == "idle"


def test_status_ready_once_static_populated(
    client: TestClient, data_dir: Path, settings: Settings, tmp_path: Path
) -> None:
    # Make the paths valid so `needs_setup` doesn't stay True due to missing files.
    install = tmp_path / "x4"
    install.mkdir()
    (install / "01.cat").touch()
    saves = tmp_path / "save"
    saves.mkdir()
    (saves / "quicksave.xml.gz").touch()
    
    settings.install_path = install
    settings.save_path = saves

    _populate_static(data_dir)
    body = client.get("/api/v1/setup/status").json()
    assert body["static_ready"] is True
    assert body["needs_setup"] is False


def test_validate_install_path(client: TestClient, tmp_path: Path) -> None:
    install = tmp_path / "x4"
    install.mkdir()
    # No archives yet → invalid.
    bad = client.post(
        "/api/v1/setup/validate-path", json={"kind": "install", "path": str(install)}
    ).json()
    assert bad["ok"] is False and bad["found"] == 0

    (install / "01.cat").touch()
    (install / "02.cat").touch()
    good = client.post(
        "/api/v1/setup/validate-path", json={"kind": "install", "path": str(install)}
    ).json()
    assert good["ok"] is True and good["found"] == 2


def test_validate_save_path(client: TestClient, tmp_path: Path) -> None:
    saves = tmp_path / "save"
    saves.mkdir()
    empty = client.post(
        "/api/v1/setup/validate-path", json={"kind": "save", "path": str(saves)}
    ).json()
    assert empty["ok"] is False

    (saves / "quicksave.xml.gz").touch()
    ok = client.post(
        "/api/v1/setup/validate-path", json={"kind": "save", "path": str(saves)}
    ).json()
    assert ok["ok"] is True and ok["found"] == 1


def test_validate_missing_folder(client: TestClient, tmp_path: Path) -> None:
    body = client.post(
        "/api/v1/setup/validate-path",
        json={"kind": "install", "path": str(tmp_path / "nope")},
    ).json()
    assert body["ok"] is False


def test_config_persists_and_applies_live(
    client: TestClient, settings: Settings, isolated_appdata: Path, tmp_path: Path
) -> None:
    install = tmp_path / "x4"
    install.mkdir()
    saves = tmp_path / "save"
    saves.mkdir()

    resp = client.post(
        "/api/v1/setup/config",
        json={"install_path": str(install), "save_path": str(saves)},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert body["install_path"] == str(install.resolve())

    # Live singleton mutated (so deps + refresher see it without a restart).
    assert settings.install_path == install.resolve()
    assert settings.save_path == saves.resolve()

    # Persisted to app-data config.json (survives a restart).
    persisted = appdata.read_config()
    assert persisted["install_path"] == str(install)
    assert persisted["save_path"] == str(saves)


def test_persisted_config_is_lowest_priority_source(
    isolated_appdata: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """config.json fills install_path when env doesn't, but a real env value wins."""
    # conftest sets X4C_INSTALL_PATH for collection; clear it so the JSON source can show.
    monkeypatch.delenv("X4C_INSTALL_PATH", raising=False)
    appdata.write_config(install_path="C:/games/x4", save_path=None)
    from_json = Settings(_env_file=None, data_dir=isolated_appdata)
    assert from_json.install_path == Path("C:/games/x4").resolve()

    monkeypatch.setenv("X4C_INSTALL_PATH", "D:/other/x4")
    from_env = Settings(_env_file=None, data_dir=isolated_appdata)
    assert from_env.install_path == Path("D:/other/x4").resolve()


def test_wipe_game_data_clears_derived_keeps_user_content(data_dir: Path, settings: Settings) -> None:
    """The reset wipe removes game-derived DBs/dirs but preserves user-authored content."""
    from x4_api.init_job import wipe_game_data

    # Game-derived data (must be removed).
    for name in ("raw.db", "static.db", "catalog.db"):
        (data_dir / name).write_bytes(b"db")
        (data_dir / f"{name}-wal").write_bytes(b"wal")
    (data_dir / "active_save.txt").write_text("save_001")
    (data_dir / "dynamic").mkdir()
    (data_dir / "dynamic" / "save_001.db").write_bytes(b"dyn")
    (data_dir / "icons").mkdir()
    (data_dir / "icons" / "energycells.png").write_bytes(b"png")

    # User-authored content (must survive).
    (data_dir / "appdata.db").write_bytes(b"designs")
    (data_dir / "refresh_config.json").write_text("{}")

    wipe_game_data(settings)

    for name in ("raw.db", "static.db", "catalog.db"):
        assert not (data_dir / name).exists()
        assert not (data_dir / f"{name}-wal").exists()
    assert not (data_dir / "active_save.txt").exists()
    assert not (data_dir / "dynamic").exists()
    assert not (data_dir / "icons").exists()

    assert (data_dir / "appdata.db").read_bytes() == b"designs"
    assert (data_dir / "refresh_config.json").exists()
