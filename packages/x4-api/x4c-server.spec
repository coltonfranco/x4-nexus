# PyInstaller spec for the `x4c-server` sidecar (onedir).
#
# Produces a self-contained server binary the Tauri desktop shell spawns with no args
# (see x4_api/server_entry.py). onedir avoids per-launch temp extraction — faster start,
# fewer antivirus false positives — and is shipped as a Tauri `bundle.resources` folder.
#
# Build from the repo root so the workspace deps resolve:
#     uv sync --group packaging
#     uv run pyinstaller packages/x4-api/x4c-server.spec
#
# Output: dist/x4c-server/x4c-server[.exe] (+ _internal/).

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# SPECPATH is the directory containing this spec file (packages/x4-api).
spec_dir = Path(SPECPATH)
repo_root = spec_dir.parent.parent

entry = str(spec_dir / "src" / "x4_api" / "server_entry.py")

# Runtime data: SQL schema files loaded via Path(__file__).parent/"sql" in x4_extract.db.
sql_src = repo_root / "packages" / "x4-extract" / "src" / "x4_extract" / "sql"
datas = [(str(p), "x4_extract/sql") for p in sql_src.glob("*.sql")]

# Native/optional packages PyInstaller's analysis can miss.
datas += collect_data_files("lxml")
datas += collect_data_files("PIL")

hiddenimports = [
    "lxml",
    "lxml._elementpath",
    "lxml.etree",
    "pydantic",
    "pydantic_settings",
    "PIL",
    "PIL.Image",
    "texture2ddecoder",
    "networkx",
    "typer",
    "uvicorn",  # imported inside a function in server_entry.py
    # uvicorn loads its protocol/lifespan/loop implementations dynamically.
    *collect_submodules("uvicorn"),
    # x4_api + x4_extract are workspace packages installed in editable mode;
    # uvicorn loads "x4_api.api.app:app" from a string so PyInstaller can't
    # trace it.
    *collect_submodules("x4_api"),
    *collect_submodules("x4_extract"),
]

a = Analysis(
    [entry],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "mypy", "ruff"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="x4c-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="x4c-server",
)
