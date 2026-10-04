from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import OrgMembership, Project, ProjectMember, Role, User, new_id
from app.rbac import Perm, require
from app.schemas import (
    MemberIn,
    MemberOut,
    MemberPatch,
    ProjectIn,
    ProjectOut,
    ProjectPatch,
    ProjectWithRole,
)
from app.services import events
from app.services.structure import project_zone_ids

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectWithRole])
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
        .order_by(Project.created_at.desc())
    ).all()
    return [_with_role(p, m) for p, m in rows]


def _with_role(p: Project, m: ProjectMember) -> ProjectWithRole:
    return ProjectWithRole.model_validate({**ProjectOut.model_validate(p).model_dump(), "my_role": m.role,
                                           "my_trades": m.trades or [], "my_zone_ids": m.zone_ids})


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    org_id = db.scalar(select(OrgMembership.org_id).where(OrgMembership.user_id == user.id).limit(1))
    if org_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User has no organization")
    project = Project(id=new_id(), org_id=org_id, name=body.name, address=body.address)
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role=Role.owner))
    events.record(db, project_id=project.id, actor_id=user.id, type="project.created",
                  entity_type="project", entity_id=project.id, data=body.model_dump())
    db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectWithRole)
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    return _with_role(db.get(Project, project_id), m)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectPatch, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_edit)
    p = db.get(Project, project_id)
    changes = body.model_dump(exclude_unset=True)
    if "settings" in changes:
        new_settings = {k: v for k, v in (changes["settings"] or {}).items() if v is not None}
        if new_settings.get("approval_mode") == "auto" and m.role != Role.owner:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can switch on auto-approval")
        changes["settings"] = {**(p.settings or {}), **new_settings}
    before = {k: getattr(p, k) for k in changes}
    for k, v in changes.items():
        setattr(p, k, v)
    events.record(db, project_id=p.id, actor_id=user.id, type="project.updated", entity_type="project",
                  entity_id=p.id, data={"before": before, "after": changes})
    db.commit()
    return p


# ---------------- members ----------------

def _owner_count(db: Session, project_id: str) -> int:
    return db.scalar(select(func.count()).where(ProjectMember.project_id == project_id,
                                                ProjectMember.role == Role.owner))


def _check_zone_ids(db: Session, project_id: str, zone_ids: list[str] | None) -> None:
    if zone_ids is not None:
        unknown = set(zone_ids) - project_zone_ids(db, project_id)
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown zones: {sorted(unknown)}")


def _member_snapshot(m: ProjectMember) -> dict:
    return {"user_id": m.user_id, "role": m.role.value, "trades": m.trades, "zone_ids": m.zone_ids}


@router.get("/{project_id}/members", response_model=list[MemberOut])
def list_members(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require(db, project_id, user.id, Perm.project_view)
    return db.scalars(select(ProjectMember).where(ProjectMember.project_id == project_id)
                      .order_by(ProjectMember.created_at)).all()


@router.post("/{project_id}/members", response_model=MemberOut, status_code=201)
def add_member(project_id: str, body: MemberIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    me = require(db, project_id, user.id, Perm.members_manage)
    if body.role == Role.owner and me.role != Role.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners can add owners")
    target = db.scalar(select(User).where(User.email == body.email.lower()))
    if target is None:
        # Email invitations come later; for now the person must sign up first.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No user with that email. Ask them to sign up first.")
    if db.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id,
                                             ProjectMember.user_id == target.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")
    _check_zone_ids(db, project_id, body.zone_ids)
    m = ProjectMember(project_id=project_id, user_id=target.id, role=body.role, trades=body.trades,
                      zone_ids=body.zone_ids)
    db.add(m)
    db.flush()
    events.record(db, project_id=project_id, actor_id=user.id, type="member.added", entity_type="member",
                  entity_id=m.id, data=_member_snapshot(m))
    db.commit()
    db.refresh(m)
    return m


def _load_target(db: Session, project_id: str, member_id: str) -> ProjectMember:
    m = db.get(ProjectMember, member_id)
    if m is None or m.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    return m


@router.patch("/{project_id}/members/{member_id}", response_model=MemberOut)
def update_member(project_id: str, member_id: str, body: MemberPatch, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    me = require(db, project_id, user.id, Perm.members_manage)
    m = _load_target(db, project_id, member_id)
    if me.role != Role.owner and (m.role == Role.owner or body.role == Role.owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners can change owners")
    if m.role == Role.owner and body.role not in (None, Role.owner) and _owner_count(db, project_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "A project needs at least one owner")
    _check_zone_ids(db, project_id, body.zone_ids)
    before = _member_snapshot(m)
    if body.role is not None:
        m.role = body.role
    if body.trades is not None:
        m.trades = body.trades
    if body.clear_zone_scope:
        m.zone_ids = None
    elif body.zone_ids is not None:
        m.zone_ids = body.zone_ids
    events.record(db, project_id=project_id, actor_id=user.id, type="member.updated", entity_type="member",
                  entity_id=m.id, data={"before": before, "after": _member_snapshot(m)})
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_member(project_id: str, member_id: str, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    me = require(db, project_id, user.id, Perm.members_manage)
    m = _load_target(db, project_id, member_id)
    if m.role == Role.owner:
        if me.role != Role.owner:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners can remove owners")
        if _owner_count(db, project_id) <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "A project needs at least one owner")
    events.record(db, project_id=project_id, actor_id=user.id, type="member.removed", entity_type="member",
                  entity_id=m.id, data=_member_snapshot(m))
    db.delete(m)
    db.commit()
