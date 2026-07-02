"""Terraforming system endpoints."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from x4_api.api.db_utils import fetch_one_or_404
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class TerraformStat(PublicModel):
    stat_id: str
    name: str | None
    icon: str | None
    default_val: int | None


class TerraformProjectGroup(PublicModel):
    group_id: str
    name: str | None


class TerraformEffect(PublicModel):
    stat: str
    change: int
    min_val: int | None


class TerraformResource(PublicModel):
    ware_id: str
    amount: int


class TerraformDelivery(PublicModel):
    ship_macro: str
    amount: int
    build_duration: int | None


class TerraformProjectSummary(PublicModel):
    project_id: str
    group_id: str | None
    name: str | None
    description: str | None
    duration: int | None
    repeat_cooldown: int | None
    resilient: int | None
    resource_credits: int | None


class TerraformProjectDetail(TerraformProjectSummary):
    effects: list[TerraformEffect]
    resources: list[TerraformResource]
    deliveries: list[TerraformDelivery]


@router.get("/terraform/stats", response_model=list[TerraformStat])
def list_terraform_stats(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[TerraformStat]:
    rows = conn.execute(
        "SELECT stat_id, name, icon, default_val FROM s.terraform_stats ORDER BY stat_id"
    ).fetchall()
    return [TerraformStat(**dict(r)) for r in rows]


@router.get("/terraform/project-groups", response_model=list[TerraformProjectGroup])
def list_terraform_project_groups(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[TerraformProjectGroup]:
    rows = conn.execute(
        "SELECT group_id, name FROM s.terraform_project_groups ORDER BY group_id"
    ).fetchall()
    return [TerraformProjectGroup(**dict(r)) for r in rows]


@router.get("/terraform/projects", response_model=list[TerraformProjectSummary])
def list_terraform_projects(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    group_id: str | None = None,
) -> list[TerraformProjectSummary]:
    sql = [
        "SELECT project_id, group_id, name, description, duration, repeat_cooldown, resilient, resource_credits",
        "FROM s.terraform_projects WHERE 1=1",
    ]
    params: dict[str, object] = {}
    if group_id is not None:
        sql.append("AND group_id = :group_id")
        params["group_id"] = group_id
    sql.append("ORDER BY group_id, project_id")
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [TerraformProjectSummary(**dict(r)) for r in rows]


@router.get("/terraform/projects/{project_id}", response_model=TerraformProjectDetail)
def get_terraform_project(
    project_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> TerraformProjectDetail:
    row = fetch_one_or_404(
        conn,
        "SELECT project_id, group_id, name, description, duration, repeat_cooldown, resilient, resource_credits "
        "FROM s.terraform_projects WHERE project_id = :id",
        {"id": project_id},
        f"Unknown project_id: {project_id}",
    )

    effects = conn.execute(
        "SELECT stat, change, min_val FROM s.terraform_project_effects WHERE project_id = :id ORDER BY stat",
        {"id": project_id},
    ).fetchall()
    resources = conn.execute(
        "SELECT ware_id, amount FROM s.terraform_project_resources WHERE project_id = :id ORDER BY ware_id",
        {"id": project_id},
    ).fetchall()
    deliveries = conn.execute(
        "SELECT ship_macro, amount, build_duration FROM s.terraform_project_deliveries WHERE project_id = :id ORDER BY ship_macro",
        {"id": project_id},
    ).fetchall()

    return TerraformProjectDetail(
        **dict(row),
        effects=[TerraformEffect(**dict(e)) for e in effects],
        resources=[TerraformResource(**dict(r)) for r in resources],
        deliveries=[TerraformDelivery(**dict(d)) for d in deliveries],
    )
