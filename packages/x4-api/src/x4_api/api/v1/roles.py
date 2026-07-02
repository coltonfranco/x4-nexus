from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class RoleSkill(PublicModel):
    skill_ref: str
    relevance: int


class Role(PublicModel):
    role_id: str
    name: str | None
    tag: str | None
    skills: list[RoleSkill]


@router.get("/roles", response_model=list[Role])
def list_roles(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[Role]:
    """List all NPC roles and their skill relevance weights."""
    rows = conn.execute("SELECT role_id, name, tag FROM s.roles").fetchall()
    skill_rows = conn.execute("SELECT role_id, skill_ref, relevance FROM s.role_skills").fetchall()

    skills_by_role: dict[str, list[RoleSkill]] = {}
    for sr in skill_rows:
        skills_by_role.setdefault(sr["role_id"], []).append(
            RoleSkill(skill_ref=sr["skill_ref"], relevance=sr["relevance"])
        )

    return [
        Role(
            role_id=r["role_id"],
            name=r["name"],
            tag=r["tag"],
            skills=skills_by_role.get(r["role_id"], []),
        )
        for r in rows
    ]
