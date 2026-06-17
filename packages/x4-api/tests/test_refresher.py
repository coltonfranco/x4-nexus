"""Tests for the background refresher's runtime config (interval enable/disable + tuning)."""

from __future__ import annotations

from pathlib import Path

from x4_api.api.refresher import MIN_INTERVAL_SEC, BackgroundRefresher, RefreshConfig
from x4_api.config import Settings


def _settings(tmp_path: Path) -> Settings:
    return Settings(install_path=Path("C:/fake/x4"), data_dir=tmp_path, poll_interval_sec=60)


def test_default_config_from_poll_interval(tmp_path: Path) -> None:
    cfg = BackgroundRefresher(_settings(tmp_path)).get_config()
    assert cfg == RefreshConfig(interval_enabled=True, interval_sec=60)


def test_set_config_persists_across_instances(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    refresher = BackgroundRefresher(settings)

    refresher.set_config(interval_enabled=False, interval_sec=300)
    assert refresher.get_config() == RefreshConfig(interval_enabled=False, interval_sec=300)

    # A fresh refresher (e.g. after a server restart) reads the persisted file back.
    assert BackgroundRefresher(settings).get_config() == RefreshConfig(
        interval_enabled=False, interval_sec=300
    )


def test_interval_provider_disabled_is_none(tmp_path: Path) -> None:
    refresher = BackgroundRefresher(_settings(tmp_path))
    assert refresher._interval() == 60.0  # provider is the unit under test
    refresher.set_config(interval_enabled=False)
    assert refresher._interval() is None  # watchdog-only


def test_interval_is_floored(tmp_path: Path) -> None:
    refresher = BackgroundRefresher(_settings(tmp_path))
    refresher.set_config(interval_sec=1)
    assert refresher.get_config().interval_sec == MIN_INTERVAL_SEC
