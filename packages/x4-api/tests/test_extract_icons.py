"""EXEMPLAR test for icon extraction.

Pattern:
    1. Provide a small, known-good DDS file (tests/fixtures/tiny.dds)
    2. Test that `_decode_dds_to_png` handles it and generates a PNG
       with the expected pixel dimensions.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image
from x4_extract.static import icons

# The fixtures directory
FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_decode_dds_to_png_produces_valid_image(tmp_path: Path) -> None:
    tiny_dds = FIXTURES_DIR / "tiny.dds"

    # We generated a tiny 4x4 DXT1 DDS file
    dds_bytes = tiny_dds.read_bytes()

    out_png = tmp_path / "tiny.png"
    success = icons._decode_dds_to_png(dds_bytes, out_png)

    assert success is True
    assert out_png.exists()

    with Image.open(out_png) as img:
        assert img.width == 4
        assert img.height == 4
        assert img.format == "PNG"
