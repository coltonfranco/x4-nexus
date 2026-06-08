# Test fixtures

This directory holds small XML payloads and golden-file extracts for regression
testing extractors across game patches.

**What belongs here:**

- `tiny_*.xml` — hand-crafted minimal documents exercising one extractor each.
  Keep under 5 KB. These run on every commit.
- `golden_v{version}/` — JSON snapshots of extractor output against real game files.
  Run via `pytest -m golden` only. Regenerate when a new game patch ships.

**What does NOT belong here:**

- Real save files (gigabytes, license-encumbered).
- Full XML blobs from the game install (license-encumbered, easy to read directly
  via `extract.catdat` for ad-hoc inspection).

Generation script (when written): `scripts/regen-golden.py`.
