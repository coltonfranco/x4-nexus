from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    texts: list[tuple[int, int, str]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    for page in root.iterfind("page"):
        page_id = page.get("id")
        if not page_id:
            continue
        try:
            pid = int(page_id)
        except ValueError:
            continue
        for t in page.iterfind("t"):
            text_id = t.get("id")
            if not text_id:
                continue
            try:
                tid = int(text_id)
            except ValueError:
                continue
            text = t.text or ""
            # Strip parenthetical comments
            parsed = []
            depth = 0
            i = 0
            n = len(text)
            while i < n:
                if text[i] == "\\" and i + 1 < n and text[i + 1] in ("(", ")"):
                    if depth == 0:
                        parsed.append(text[i + 1])
                    i += 2
                    continue
                if text[i] == "(":
                    depth += 1
                    i += 1
                    continue
                if text[i] == ")":
                    if depth > 0:
                        depth -= 1
                    else:
                        parsed.append(")")
                    i += 1
                    continue
                if depth == 0:
                    parsed.append(text[i])
                i += 1

            clean_text = "".join(parsed).replace("\\n", "\n")
            if clean_text:
                out.texts.append((pid, tid, clean_text))
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM texts")
    conn.executemany(
        "INSERT OR IGNORE INTO texts (page_id, text_id, text) VALUES (?, ?, ?)",
        result.texts,
    )
