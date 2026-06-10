"""Tests for the background poller loop."""

from __future__ import annotations

import shutil
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.dynamic import poller
from x4_extract.dynamic.poller import PollResult


def _settings(tmp_path: Path, fixtures_dir: Path) -> ExtractSettings:
    folder = tmp_path / "saves"
    folder.mkdir()
    shutil.copyfile(fixtures_dir / "tiny_save.xml.gz", folder / "save_001.xml.gz")
    return ExtractSettings(data_dir=tmp_path / "data", save_path=folder)


def test_poll_once_ingests_then_reports_unchanged(data_dir: Path, fixtures_dir: Path, tmp_path: Path) -> None:
    settings = _settings(tmp_path, fixtures_dir)

    first = poller.poll_once(settings)
    assert first.save_path is not None
    assert first.db_path is not None and first.db_path.exists()
    assert first.ingested is True

    second = poller.poll_once(settings)
    assert second.ingested is False  # source unchanged → no rebuild


def test_poll_once_no_saves_is_graceful(tmp_path: Path) -> None:
    empty = tmp_path / "saves"
    empty.mkdir()
    (empty / "placeholder.txt").write_text("not a save")
    settings = ExtractSettings(data_dir=tmp_path / "data", save_path=empty)

    # save_path with no *.xml.gz raises in resolve; poll_once swallows it.
    result = poller.poll_once(settings)
    assert result == PollResult(None, None, False)


def test_watch_runs_bounded_iterations_without_real_sleep(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    settings = _settings(tmp_path, fixtures_dir)
    seen: list[PollResult] = []
    sleeps: list[float] = []

    poller.watch(settings, seen.append, iterations=2, sleep=sleeps.append)

    assert len(seen) == 2
    assert seen[0].ingested is True
    assert seen[1].ingested is False
    assert sleeps == [settings.poll_interval_sec]  # slept once, between the two ticks
