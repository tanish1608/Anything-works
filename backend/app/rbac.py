"""Project-level role-based access control. The ONLY place permission rules live."""

import enum

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProjectMember, Role


class Perm(enum.StrEnum):
    project_view = "project.view"
    project_edit = "project.edit"
    members_manage = "members.manage"
    structure_edit = "structure.edit"
    drawings_upload = "drawings.upload"
    conversion_review = "conversion.review"
    model_approve = "model.approve"
    progress_upload = "progress.upload"
    progress_approve = "progress.approve"
    issue_create = "issue.create"
    history_view = "history.view"


_ALL = set(Perm)
MATRIX: dict[Role, set[Perm]] = {
    Role.owner: _ALL,
    Role.pm: _ALL,  # owner-specific limits (managing owners) are checked in the members service
    Role.trade: {Perm.project_view, Perm.progress_upload, Perm.issue_create, Perm.history_view},
    Role.viewer: {Perm.project_view, Perm.history_view},
}


def can(member: ProjectMember | None, perm: Perm) -> bool:
    return member is not None and perm in MATRIX[member.role]


def get_member(db: Session, project_id: str, user_id: str) -> ProjectMember | None:
    return db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    )


def require(db: Session, project_id: str, user_id: str, perm: Perm) -> ProjectMember:
    member = get_member(db, project_id, user_id)
    if member is None:
        # Don't reveal that the project exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not can(member, perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {perm}")
    return member


def zone_visible(member: ProjectMember, zone_id: str) -> bool:
    """Trade members with a zone scope only see their zones; everyone else sees all."""
    if member.role != Role.trade or member.zone_ids is None:
        return True
    return zone_id in member.zone_ids


def trade_visible(member: ProjectMember, trade: str) -> bool:
    """Trade members only see their own trades' layers (used by the viewer from M1)."""
    return member.role != Role.trade or trade in member.trades
