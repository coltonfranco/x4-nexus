"""Standalone server entrypoint for the bundled `x4c-server` sidecar.

The PyInstaller build (see `x4c-server.spec`) targets this module so the produced
binary *serves by default* — the Tauri desktop shell spawns it with no arguments.
It deliberately avoids the Typer CLI layer (`cli.py`) so the frozen binary doesn't
need a subcommand and pulls in fewer imports.

Logic mirrors `cli.serve()`; never duplicate server behaviour beyond what that does.
"""

from __future__ import annotations

import sys


def main() -> int:
    import uvicorn

    from x4_api.config import Settings

    # Settings never raises — install_path is optional until the setup wizard runs.
    settings = Settings()
    uvicorn.run(
        "x4_api.api.app:app",
        host=settings.host,
        port=settings.port,
        factory=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
