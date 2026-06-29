"""x4c CLI — operator entry point.

Commands are thin wrappers around the same functions the API server calls; never
duplicate logic here. `settings` is loaded lazily so missing env vars surface as
a friendly message from `doctor` rather than an import-time crash.
"""

from __future__ import annotations

import sys
from pathlib import Path

import typer
from pydantic import ValidationError

from x4_api import __version__

app = typer.Typer(add_completion=False, help="X4: Foundations companion CLI.")


def _load_settings() -> Settings:  # noqa: F821 — forward ref to deferred import
    from x4_api.config import Settings

    try:
        return Settings()
    except ValidationError as exc:
        typer.secho("Configuration error — required env vars are missing:", fg="red")
        for err in exc.errors():
            field = ".".join(str(p) for p in err["loc"])
            typer.secho(f"  X4C_{field.upper()}: {err['msg']}", fg="red")
        typer.echo("")
        typer.echo("Copy .env.example to .env and fill in X4C_INSTALL_PATH and X4C_SAVE_PATH.")
        raise typer.Exit(2) from exc


@app.command()
def version() -> None:
    """Print the installed x4-api version."""
    typer.echo(__version__)


@app.command()
def doctor() -> None:
    """Verify install + save paths and report what was found."""
    from x4_extract.config import latest_save, resolve_save_path

    settings = _load_settings()
    typer.echo(f"x4-api v{__version__}")
    typer.echo("")
    typer.echo("Install path:")
    install = settings.install_path
    typer.echo(f"  {install}")
    cats = sorted(install.glob("*.cat"))
    if not cats:
        typer.secho(f"  ERROR: no .cat files found in {install}", fg="red")
        raise typer.Exit(2)
    typer.echo(f"  found {len(cats)} .cat files (base + DLC + workshop)")

    typer.echo("")
    typer.echo("Save path:")
    try:
        save_folder = resolve_save_path(settings.save_path)
    except FileNotFoundError as exc:
        typer.secho(f"  ERROR: {exc}", fg="red")
        raise typer.Exit(2) from exc
    typer.echo(f"  {save_folder}")
    saves = sorted(save_folder.glob("*.xml.gz"))
    typer.echo(f"  found {len(saves)} *.xml.gz save(s)")
    if saves:
        newest = latest_save(save_folder)
        typer.echo(f"  newest: {newest.name} ({newest.stat().st_size / 1_000_000:.1f} MB)")

    typer.echo("")
    typer.echo("Data dir:")
    typer.echo(f"  {settings.data_dir}")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    typer.secho("OK", fg="green")


@app.command("rebuild-static")
def rebuild_static() -> None:
    """Extract game XML → static.db. No-op if game files unchanged."""
    from x4_extract.static.pipeline import run as run_static

    run_static(_load_settings())


@app.command("rebuild-datalake")
def rebuild_datalake() -> None:
    """Extract raw metadata XMLs into raw_files table in raw.db."""
    from x4_extract.static.crawler import run_crawler

    run_crawler(_load_settings())


@app.command("rebuild-icons")
def rebuild_icons() -> None:
    """Extract icon DDS files → PNGs under data/icons/."""
    from x4_extract.static.icons import run as run_icons

    run_icons(_load_settings())


@app.command("ingest-save")
def ingest_save(path: Path | None = typer.Argument(None)) -> None:
    """Parse a save file into dynamic.db. Defaults to the newest in the save folder."""
    from x4_extract.config import latest_save, resolve_save_path
    from x4_extract.dynamic.pipeline import run as run_dynamic

    settings = _load_settings()
    save = path or latest_save(resolve_save_path(settings.save_path))
    run_dynamic(settings, save)


@app.command("profile-save")
def profile_save(path: Path | None = typer.Argument(None)) -> None:
    """Time each ingest stage on a save to find where the 5-10s goes.

    Defaults to the newest save in the save folder. Breaks the cost into decompress,
    iterparse, visitor dispatch, and flush, with a cProfile breakdown of the dispatch.
    """
    from x4_extract.config import latest_save, resolve_save_path
    from x4_extract.dynamic.profile import format_report
    from x4_extract.dynamic.profile import profile_save as run_profile

    settings = _load_settings()
    save = path or latest_save(resolve_save_path(settings.save_path))
    typer.echo(f"Profiling {save} ... (streams the full save several times)")
    typer.echo(format_report(run_profile(settings, save)))


@app.command()
def watch() -> None:
    """Poll the active save folder and keep its dynamic DB fresh until interrupted."""
    from datetime import datetime

    from x4_extract.dynamic import poller
    from x4_extract.dynamic.poller import PollResult

    settings = _load_settings()

    def on_tick(r: PollResult) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        if r.save_path is None:
            typer.echo(f"[{ts}] no saves found")
        elif r.ingested:
            typer.secho(f"[{ts}] ingested {r.save_path.name}", fg="green")
        else:
            typer.echo(f"[{ts}] {r.save_path.name} unchanged")

    typer.echo(
        f"Watching for save changes (event-driven, {settings.poll_interval_sec}s safety poll). "
        "Ctrl-C to stop."
    )
    try:
        poller.watch_realtime(settings, on_tick)
    except KeyboardInterrupt:
        typer.echo("stopped")


@app.command()
def serve(reload: bool = False) -> None:
    """Run the FastAPI server."""
    import uvicorn

    settings = _load_settings()
    uvicorn.run(
        "x4_api.api.app:app",
        host=settings.host,
        port=settings.port,
        reload=reload,
        factory=True,
    )


if __name__ == "__main__":
    sys.exit(app())
