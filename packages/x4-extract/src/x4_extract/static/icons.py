"""Convert game DDS icons → PNG static assets.

Pipeline:
    1. Build merged .cat index via `extract.catdat`.
    2. Parse `libraries/icons.xml`: map logical_id → texture_path.
    3. For each path, locate its CatEntry, byte-range read the DDS bytes
       (gunzip if path ends in .gz).
    4. Decode DDS via `texture2ddecoder` (BC1/BC3/BC7 cover X4's formats).
       Fallback: shell out to `texconv.exe` on Windows for unsupported formats.
    5. Save PNG to `{settings.data_dir}/icons/{logical_id}.png` via Pillow.
    6. Maintain an icon manifest at `data/icons/manifest.json` with {logical_id, source_hash}
       so reruns skip unchanged files.
"""

from __future__ import annotations

import gzip
import json
import logging
import platform
import struct
import subprocess
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

from lxml import etree
from PIL import Image

from x4_extract.config import ExtractSettings
from x4_extract.static.catdat import CatEntry, build_index, discover_cats, iter_cat, read_entry
from x4_extract.static.progress import log_progress as _log

try:
    import texture2ddecoder
except ImportError:
    texture2ddecoder = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


def run(settings: ExtractSettings, on_progress: Callable[[str, float], None] | None = None) -> None:
    """Extract all icons from game data to PNG files."""
    t0 = time.monotonic()
    _log("Starting icon generation...")
    
    cat_paths = discover_cats(settings.install_path)
    if not cat_paths:
        _log("No catalogs found for icons.")
        return

    index = build_index(cat_paths)

    icons_xml_entries: list[CatEntry] = []
    for cat in cat_paths:
        for entry in iter_cat(cat):
            if entry.path == "libraries/icons.xml":
                icons_xml_entries.append(entry)

    if not icons_xml_entries:
        return

    out_dir = settings.data_dir / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = out_dir / "manifest.json"
    manifest: dict[str, dict[str, str]] = {}
    if manifest_path.exists():
        try:
            with manifest_path.open("r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError:
            pass

    new_manifest: dict[str, dict[str, str]] = {}
    processed_count = 0
    skipped_count = 0

    # Collect all icon mappings first to handle overwrites in DLCs
    # mapping logical_id -> texture_path
    icon_map = {}
    for xml_entry in icons_xml_entries:
        xml_bytes = read_entry(xml_entry)
        root = etree.fromstring(xml_bytes)
        for icon in root.iter("icon"):
            logical_id = icon.get("name")
            texture_path = icon.get("texture")
            if not logical_id or not texture_path:
                continue

            if "*" in texture_path:
                # Handle wildcard matching (e.g. assets/textures/ui/ships/*.tga)
                # X4 replaces the * in texture with the * from name (e.g. ship_* -> ship_behemoth)
                # To do this, we list all matching keys in index.
                posix_path = texture_path.replace("\\", "/")
                prefix, suffix = posix_path.split("*", 1)

                name_prefix, name_suffix = logical_id.split("*", 1)

                # Check all index paths that might match
                # The index might have assets/textures/ui/ships/ship_behemoth.gz
                for idx_path in index:
                    if idx_path.startswith(prefix):
                        # Calculate what the `*` matched
                        # The suffix in the XML is usually .tga, but the index has .gz or .dds
                        # We just extract the wildcard portion before the file extension.
                        stem_match = idx_path[len(prefix):]
                        if "/" in stem_match:
                            continue  # Don't cross directories

                        wildcard_val = stem_match.rsplit(".", 1)[0]
                        if wildcard_val.endswith(".dds") or wildcard_val.endswith(".tga"):
                            wildcard_val = wildcard_val[:-4]

                        concrete_id = f"{name_prefix}{wildcard_val}{name_suffix}"
                        icon_map[concrete_id] = idx_path
            else:
                icon_map[logical_id] = texture_path

    total = len(icon_map)
    for i, (logical_id, texture_path) in enumerate(icon_map.items()):
        if i % 10 == 0 and on_progress:
            on_progress(f"Building icons ({i}/{total})...", i / max(total, 1))

        # Convert backslashes and strip prefix if needed
        # Often texture path looks like: extensions\ego_dlc_terran\assets\textures\ui\wares\ware_energycells.tga
        posix_path = texture_path.replace("\\", "/")
        stem_path = posix_path.rsplit(".", 1)[0]

        # Try finding the corresponding entry in index
        icon_entry: CatEntry | None = None
        for suffix in [".gz", ".dds", ".dds.gz", ".tga.gz", ".tga", ""]:
            # Check with extension replacement
            test_path = stem_path + suffix
            if test_path in index:
                icon_entry = index[test_path]
                break

            # Check if index path perfectly matches what was registered by wildcards
            if posix_path in index:
                icon_entry = index[posix_path]
                break

            if "assets/" in test_path:
                idx = test_path.find("assets/")
                stripped = test_path[idx:]
                if stripped in index:
                    icon_entry = index[stripped]
                    break

        if not icon_entry:
            continue

        # Check hash against manifest to skip unchanged
        if logical_id in manifest and manifest[logical_id].get("md5") == icon_entry.md5:
            new_manifest[logical_id] = manifest[logical_id]
            skipped_count += 1
            continue

        try:
            raw_data = read_entry(icon_entry)
            dds_data = gzip.decompress(raw_data) if icon_entry.path.endswith(".gz") else raw_data

            # Determine category subfolder using the texture path's directory
            directory = posix_path.rsplit("/", 1)[0] if "/" in posix_path else "misc"

            # Strip common prefixes for cleaner organization
            if directory.startswith("assets/textures/"):
                directory = directory[len("assets/textures/"):]
            elif directory.startswith("extensions/"):
                parts = directory.split("/")
                if "assets" in parts and "textures" in parts:
                    idx = parts.index("textures")
                    directory = "/".join(parts[idx+1:])

            # Filter to only keep 'ui/' icons and rebase them to root
            if not directory.startswith("ui/"):
                continue

            # Remove 'ui/' prefix to rebase to root
            category = directory[3:].strip("/")
            if not category:
                category = "misc"

            cat_dir = out_dir / category
            cat_dir.mkdir(parents=True, exist_ok=True)

            out_png = cat_dir / f"{logical_id}.png"
            if _decode_dds_to_png(dds_data, out_png):
                new_manifest[logical_id] = {
                    "md5": icon_entry.md5,
                    "path": f"{category}/{logical_id}.png"
                }
                processed_count += 1
        except Exception as e:
            logger.warning(f"Failed to process icon {logical_id} from {icon_entry.path}: {e}")

    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(new_manifest, f, indent=2)

    if on_progress:
        on_progress(f"Building icons ({total}/{total})...", 1.0)
    
    _log(f"Icon generation complete: {processed_count} extracted (skipped {skipped_count} unchanged) in {time.monotonic() - t0:.1f}s")


def _decode_dds_to_png(dds_data: bytes, output_path: Path) -> bool:
    """Decode a DDS blob to a PNG file using texture2ddecoder or texconv."""
    if len(dds_data) < 128 or dds_data[:4] != b"DDS ":
        return False

    header = dds_data[4:128]
    height, width = struct.unpack_from("<II", header, 8)
    _pf_flags, pf_fourcc = struct.unpack_from("<I4s", header, 76)
    fourcc = pf_fourcc.decode("ascii", errors="ignore").strip("\x00")

    data_offset = 128
    if fourcc == "DX10":
        if len(dds_data) < 148:
            return False
        # In DX10, format is encoded differently. We'll attempt BC7 decoding as fallback if texture2ddecoder is available.
        # But texture2ddecoder needs explicit format. We'll just try BC7.
        fourcc = "BC7"
        data_offset += 20

    raw_pixels = None
    if texture2ddecoder is not None:
        try:
            if fourcc in ("DXT1", "BC1"):
                raw_pixels = texture2ddecoder.decode_bc1(dds_data[data_offset:], width, height)
            elif fourcc in ("DXT3", "BC2"):
                # DXT3 / BC2 are rarely used and may not be supported by this version of texture2ddecoder
                pass
            elif fourcc in ("DXT5", "BC3"):
                raw_pixels = texture2ddecoder.decode_bc3(dds_data[data_offset:], width, height)
            elif fourcc in ("BC4",):
                raw_pixels = texture2ddecoder.decode_bc4(dds_data[data_offset:], width, height)
            elif fourcc in ("BC5",):
                raw_pixels = texture2ddecoder.decode_bc5(dds_data[data_offset:], width, height)
            elif fourcc in ("BC7", "DX10"):
                raw_pixels = texture2ddecoder.decode_bc7(dds_data[data_offset:], width, height)
        except Exception:
            pass

    if raw_pixels is not None:
        # texture2ddecoder produces raw BGRA bytes
        img = Image.frombytes("RGBA", (width, height), raw_pixels, "raw", "BGRA")
        img.save(output_path)
        return True

    # Attempt to load natively with Pillow (handles uncompressed and standard DXT formats)
    import io
    try:
        with Image.open(io.BytesIO(dds_data)) as img:
            img.save(output_path)
        return True
    except Exception:
        pass

    # Fallback to texconv
    if platform.system() == "Windows":
        return _fallback_texconv(dds_data, output_path)
    else:
        logger.warning(f"Unsupported DDS format {fourcc} and no texconv fallback on macOS/Linux")
        return False


def _fallback_texconv(dds_data: bytes, output_path: Path) -> bool:
    """Use DirectXTex texconv.exe to convert to PNG."""
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dds = Path(temp_dir) / "temp.dds"
        temp_dds.write_bytes(dds_data)

        try:
            subprocess.run(
                [
                    "texconv.exe",
                    "-ft", "png",
                    "-o", temp_dir,
                    "-nologo",
                    str(temp_dds)
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            temp_png = Path(temp_dir) / "temp.png"
            if temp_png.exists():
                temp_png.replace(output_path)
                return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    return False
