"""Shared, review-only construction workflow. No inference or automatic completion path.

The work snapshot is a projection; receipt references and append-only events retain prior evidence
and authenticated decisions. Conditional revisions protect against overlapping/stale decisions.
"""
from copy import deepcopy
from datetime import date

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    Building,
    Element,
    ElementRevision,
    ElementStatus,
    Event,
    Level,
    Photo,
    Project,
    ProjectMember,
    Role,
    Upload,
    User,
    WorkPackage,
    WorkSubmission,
    Zone,
    utcnow,
)
from app.rbac import Perm, can, require, trade_visible, zone_visible
from app.services import events
from app.services.notify import notify


def visible(member: ProjectMember, work: WorkPackage) -> bool:
    loc = work.state["location"]
    return member.role != Role.trade or (
        work.assignee_id == member.user_id and trade_visible(member, work.state["trade"])
        and (member.zone_ids is None or (loc["roomId"] and zone_visible(member, loc["roomId"])))
    )


def load(db: Session, work_id: str, user: User, perm=Perm.project_view):
    work = db.get(WorkPackage, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    member = require(db, work.project_id, user.id, perm)
    if not visible(member, work):
        raise HTTPException(404, "Work not found")
    return work, member


def current(db: Session, work: WorkPackage):
    project = db.scalar(select(Project).where(Project.id == work.project_id).with_for_update().execution_options(populate_existing=True))
    if project.current_version_id != work.version_id:
        raise HTTPException(409, "The approved reference changed. Reconfirm this work against the current model.")
    return project


def assignee(db: Session, project_id: str, user_id: str, trade: str, zone_id: str | None):
    member = require(db, project_id, user_id, Perm.progress_upload)
    if member.role == Role.trade and (
        not trade_visible(member, trade) or (member.zone_ids is not None and (
            not zone_id or not zone_visible(member, zone_id)))
    ):
        raise HTTPException(422, "Choose a project member with access to this work's trade and area")
    return db.get(User, user_id)


def source(db: Session, project_id: str, version_id: str, element_id: str):
    project = db.scalar(select(Project).where(Project.id == project_id).with_for_update().execution_options(populate_existing=True))
    element = db.get(Element, element_id)
    rev = db.scalar(select(ElementRevision).where(
        ElementRevision.version_id == version_id, ElementRevision.element_id == element_id))
    if not project.current_version_id or version_id != project.current_version_id:
        raise HTTPException(409, "Choose the current approved model before tracking work")
    if not rev or not element or element.project_id != project_id or not rev.level_id or not rev.bbox:
        raise HTTPException(422, "This component needs a confirmed source floor and geometry")
    level = db.get(Level, rev.level_id)
    building = db.get(Building, level.building_id)
    zone = db.get(Zone, rev.zone_id) if rev.zone_id else None
    b = rev.bbox
    # IFC Z up -> three.js Y up, shared with the model importer.
    center = [(b[i] + b[i + 3]) / 2 for i in range(3)]
    loc = {"version": version_id, "building": building.name, "levelId": level.id,
           "levelName": level.name, "roomId": zone.id if zone else None,
           "roomName": zone.name if zone else "Unassigned area", "spaceCode": zone.code or "" if zone else "",
           "elements": [element_id], "anchor": [center[0], center[2], -center[1]]}
    return rev, loc


def item(work: WorkPackage, current_version: str | None = None):
    out = deepcopy(work.state)
    out.update(serverRevision=work.revision, assigneeId=work.assignee_id)
    if current_version is not None and current_version != work.version_id:
        out.update(status="issue" if out.get("issue") else "review", progress="Reference changed",
                   review="Reconfirm source reference", detail="An approved model revision superseded this work's reference. Prior decisions are retained.")
    return out


def save(db: Session, work: WorkPackage, state: dict, expected: int, *, version_id=None, assignee_id=None):
    values = {"state": state, "revision": expected + 1}
    if version_id:
        values["version_id"] = version_id
    if assignee_id:
        values["assignee_id"] = assignee_id
    result = db.execute(update(WorkPackage).where(WorkPackage.id == work.id,
                                                WorkPackage.revision == expected).values(**values))
    if result.rowcount != 1:
        raise HTTPException(409, "This work changed. Refresh and review the latest evidence before saving.")
    db.refresh(work)


def record(db: Session, work: WorkPackage, user: User, action: str, reason: str):
    events.record(db, project_id=work.project_id, actor_id=user.id, type=f"work.{action}",
                  entity_type="work", entity_id=work.id, zone_id=work.state["location"]["roomId"],
                  data={"text": reason, "tone": work.state["status"], "snapshot": item(work)},
                  evidence_ids=[p["id"] for p in work.state["photos"]])
    managers = db.scalars(select(ProjectMember.user_id).where(
        ProjectMember.project_id == work.project_id, ProjectMember.role.in_([Role.pm, Role.owner]))).all()
    notify(db, [work.assignee_id, *managers], actor_id=user.id, project_id=work.project_id,
           kind=f"work.{action}", title=f"{user.name}: {work.state['title']}", body=reason[:200],
           link=f"/?project=api%3A{work.project_id}&panel=record&work={work.id}")


def snapshot(db: Session, project_id: str, user: User):
    member = require(db, project_id, user.id, Perm.project_view)
    project = db.get(Project, project_id)
    works = [w for w in db.scalars(select(WorkPackage).where(WorkPackage.project_id == project_id)
                                  .order_by(WorkPackage.created_at)) if visible(member, w)]
    ids = [w.id for w in works]
    rows = db.execute(select(Event, User.name).outerjoin(User, User.id == Event.actor_id).where(
        Event.project_id == project_id, Event.entity_type == "work", Event.entity_id.in_(ids))
        .order_by(Event.id.desc())).all()
    jobs = []
    from app.agent.assessment import project as ai_runs
    receipts = db.execute(select(WorkSubmission.upload_id).where(WorkSubmission.work_id.in_(ids))).scalars().all()
    checks = ai_runs(db, list(receipts))
    for receipt, upload in db.execute(select(WorkSubmission, Upload)
                                     .join(Upload, Upload.id == WorkSubmission.upload_id)
                                     .where(WorkSubmission.work_id.in_(ids))):
        photos = db.scalars(select(Photo.id).where(Photo.upload_id == upload.id)).all()
        jobs.append({"id": receipt.id, "item": receipt.work_id, "update": upload.id,
                     "modelVersion": receipt.reference["location"]["version"],
                     "elements": receipt.reference["location"]["elements"], "photos": photos,
                     "note": upload.note, "claim": receipt.claim,
                     "reference": receipt.reference["reference"], "scope": receipt.reference["scope"],
                     "state": {"queued": "ai_queued", "running": "ai_running", "completed": "ai_suggested",
                               "failed": "ai_failed", "superseded": "superseded"}.get(
                         checks.get(upload.id, {}).get("status"), "manual_review"),
                     "ai": checks.get(upload.id), "at": upload.created_at.isoformat()})
    projected = [item(w, project.current_version_id) for w in works]
    # Issues created by retained APIs still override any previous completion on the same component.
    from app.services.issues import open_issue_counts
    counts = open_issue_counts(db, project_id)
    for work, view in zip(works, projected, strict=True):
        if counts.get(work.element_id) and not view.get("issue"):
            view.update(status="issue", progress="Open linked issue", detail="A linked component issue remains open. Resolve it before accepting work.")
    return {"state": {"version": 1, "items": projected,
                      "events": [{"id": str(e.id), "item": e.entity_id, "at": e.at.isoformat(),
                                  "actor": name or ("Placeholder AI · suggestion" if e.actor_id is None else "Former project member"),
                                  "text": e.data["text"],
                                  "tone": e.data["tone"], "snapshot": e.data.get("snapshot")} for e, name in rows],
                      "draft": None, "projectName": project.name, "reportNote": "", "reportSigned": None,
                      "modelVersion": project.current_version_id, "modelApproved": bool(project.current_version_id),
                      "assessmentJobs": sorted(jobs, key=lambda j: j["at"], reverse=True)},
            "user": {"id": user.id, "name": user.name, "email": user.email}, "role": member.role.value,
            "permissions": {"review": can(member, Perm.progress_approve), "capture": can(member, Perm.progress_upload),
                            "plan": can(member, Perm.progress_approve)}}


def due_date(value: str | None):
    try:
        if not value or date.fromisoformat(value).isoformat() != value:
            raise ValueError
    except ValueError:
        raise HTTPException(422, "A valid due date is required") from None


def project_progress(db: Session, work: WorkPackage, user: User | None):
    """Mirror work status onto the element. `user` is None for the AI completion policy."""
    element = db.get(Element, work.element_id)
    basis = {"human": "human", "ai": "ai"}.get(work.state["status"])
    new = ElementStatus.done if basis else ElementStatus.needs_review
    if element.status != new:
        before = element.status.value
        element.status = new
        element.status_updated_at = utcnow()
        events.record(db, project_id=work.project_id, actor_id=user.id if user else None,
                      type="element.status_changed", entity_type="element", entity_id=element.id,
                      zone_id=work.state["location"]["roomId"], evidence_ids=[p["id"] for p in work.state["photos"]],
                      data={"from": before, "to": new.value, "reason": work.state["review"],
                            "completion_basis": basis,
                            "work_id": work.id, "upload_id": work.state["update"]})
