from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    roles: list[dict[str, Any]] = field(default_factory=list)
    skills: list[dict[str, Any]] = field(default_factory=list)


def extract(roles_xml: bytes, posts_xml: bytes | None = None) -> ExtractResult:
    out = ExtractResult()

    root = etree.fromstring(roles_xml)
    for r in root.iterfind("role"):
        rid = r.get("id")
        if not rid:
            continue
        out.roles.append(
            {
                "role_id": rid,
                "name": r.get("name"),
                "tag": r.get("tag"),
            }
        )
        for s in r.iterfind("skills/skill"):
            sref = s.get("ref")
            rel = s.get("relevance")
            if sref and rel:
                out.skills.append({"role_id": rid, "skill_ref": sref, "relevance": int(rel)})

    if posts_xml:
        root_posts = etree.fromstring(posts_xml)
        for p in root_posts.iterfind("post"):
            pid = p.get("id")
            if not pid:
                continue
            out.roles.append(
                {
                    "role_id": pid,
                    "name": p.get("name"),
                    "tag": p.get("tag"),
                }
            )
            for s in p.iterfind("skills/skill"):
                sref = s.get("ref")
                rel = s.get("relevance")
                if sref and rel:
                    out.skills.append({"role_id": pid, "skill_ref": sref, "relevance": int(rel)})

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM role_skills")
    conn.execute("DELETE FROM roles")
    conn.executemany(
        "INSERT INTO roles (role_id, name, tag) VALUES (:role_id, :name, :tag)",
        result.roles,
    )
    conn.executemany(
        "INSERT INTO role_skills (role_id, skill_ref, relevance) VALUES (:role_id, :skill_ref, :relevance)",
        result.skills,
    )
