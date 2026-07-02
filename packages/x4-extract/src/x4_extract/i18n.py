from __future__ import annotations

import re
import sqlite3

from lxml import etree

from x4_extract.constants import DEFAULT_LANGUAGE_CODE


class Localizer:
    """Handles parsing X4 localization files and resolving {page,text} macros."""

    def __init__(self, raw_conn: sqlite3.Connection, language_code: str = DEFAULT_LANGUAGE_CODE):
        self._map: dict[tuple[str, str], str] = {}
        # Matches {page_id, text_id} or {page_id,text_id} or {page_id,text_id}
        self._pattern = re.compile(r"\{(\d+),\s*(\d+)\}")
        self._load_from_db(raw_conn, language_code)

    def _load_from_db(self, conn: sqlite3.Connection, language_code: str) -> None:
        """Load translations from raw.db into memory."""
        # The datalake stores the merged XML in raw_files
        path = f"t/0001-l{language_code}.xml"
        try:
            row = conn.execute(
                "SELECT content FROM raw_files WHERE filepath = ?", (path,)
            ).fetchone()
        except sqlite3.OperationalError:
            row = None

        if not row:
            # If language file is not found, we just do nothing and return macros
            return

        xml_bytes = row[0].encode("utf-8")
        try:
            root = etree.fromstring(xml_bytes)
            for page in root.iterfind("page"):
                page_id = page.get("id")
                if not page_id:
                    continue
                for t in page.iterfind("t"):
                    text_id = t.get("id")
                    if not text_id:
                        continue
                    text = t.text or ""
                    # Sometimes text contains comment like `(Station type)Energy Factory`
                    # We can optionally strip comments in parenthesis at the start if needed,
                    # Strip unescaped (comments) and unescape literal \\( and \\)
                    out = []
                    depth = 0
                    i = 0
                    n = len(text)
                    while i < n:
                        if text[i] == "\\" and i + 1 < n and text[i + 1] in ("(", ")"):
                            if depth == 0:
                                out.append(text[i + 1])
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
                                if depth == 0:
                                    out.append(")")
                            i += 1
                            continue
                        if depth == 0:
                            out.append(text[i])
                        i += 1

                    self._map[(page_id, text_id)] = "".join(out).strip()
        except etree.XMLSyntaxError:
            pass

    def resolve(self, text: str | None) -> str | None:
        """Resolve all macros in a string to their localized equivalents recursively."""
        if not text:
            return text

        def replacer(match: re.Match[str]) -> str:
            page_id = match.group(1)
            text_id = match.group(2)
            return self._map.get((page_id, text_id), match.group(0))

        # Recurse up to 5 times to handle nested macros like (Behemoth Sentinel){20101,11001} {20111,1201}
        for _ in range(5):
            new_text = self._pattern.sub(replacer, text)
            if new_text == text:
                break
            text = new_text

        return text
