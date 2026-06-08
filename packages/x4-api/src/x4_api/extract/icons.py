"""Convert game DDS icons → PNG static assets.

NOT YET IMPLEMENTED. Shape:

    1. Build merged .cat index via `extract.catdat`.
    2. Parse `libraries/icons.xml` from `08.cat`: map logical_id → texture_path.
    3. For each path, locate its CatEntry, byte-range read the DDS bytes
       (gunzip if path ends in .gz).
    4. Decode DDS via `texture2ddecoder` (BC1/BC3/BC7 cover X4's formats).
       Fallback: shell out to `texconv.exe` on Windows for unsupported formats.
    5. Save PNG to `{settings.data_dir}/icons/{logical_id}.png` via Pillow.

Total output: ~990 icons, single-digit MB. Cache result; rerun only when content_hash
changes.
"""

from __future__ import annotations

from x4_api.config import Settings


def run(settings: Settings) -> None:
    raise NotImplementedError(
        "Icon extraction not yet implemented — see docstring for the pipeline shape."
    )
