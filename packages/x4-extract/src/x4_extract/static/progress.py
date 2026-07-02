"""Console progress helpers for extraction pipelines."""

from __future__ import annotations

import time


def log_progress(msg: str) -> None:
    """Print a timestamped progress message."""
    ts = time.strftime("%H:%M:%S")
    print(f"\033[90m{ts}\033[0m  {msg}", flush=True)


def elapsed(start: float) -> str:
    """Return a color-coded elapsed duration string."""
    dt = time.monotonic() - start
    if dt < 1.0:
        color = "32"
    elif dt < 10.0:
        color = "33"
    else:
        color = "31"
    return f"\033[{color}m{dt:.1f}s\033[0m"
