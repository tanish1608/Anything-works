"""The active workspace's persisted manual daily loop. Public fixtures never call these routes."""
import hashlib
import json
from copy import deepcopy
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import jobs
from app.agent import assessment as ai_check
from app.agent.measurements import Capture
from app.auth.deps import current_user
from app.db import SessionLocal, get_db
from app.models import (
    OPEN_ISSUE_STATUSES,
    Issue,
    IssueStatus,
    Photo,
    Project,
    Upload,
    User,
    WorkAssessment,
    WorkPackage,
    WorkSubmission,
    new_id,
    utcnow,
)
from app.rbac import Perm, require
from app.services import workflow as flow
from app.services.photos import inspect_photo
from app.storage import get_storage

router = APIRouter(tags=["shared-workflow"])


class WorkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=300)
    element_id: str
    model_version_id: str
    assignee_id: str
    capture_guidance: str = Field(default="Context view and a close-up of the reported condition", max_length=2000)


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["accept", "confirm", "request", "resolve", "reject", "assign", "reopen", "dismiss", "reference"]
    reason: str = Field(min_length=1, max_length=5000)
    expected_revision: int = Field(ge=1)
    update_id: str | None = None
    assignee_id: str | None = None
    due: str | None = None
    # The AI check the PM consulted, kept as provenance; it never makes the decision.
    assessment_id: str | None = None


@router.get("/projects/{project_id}/workspace")
def workspace(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return flow.snapshot(db, project_id, user)


@router.post("/projects/{project_id}/work", status_code=201)
def create_work(project_id: str, body: WorkIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require(db, project_id, user.id, Perm.progress_approve)
    rev, loc = flow.source(db, project_id, body.model_version_id, body.element_id)
    person = flow.assignee(db, project_id, body.assignee_id, rev.trade, rev.zone_id)
    if not body.title.strip():
        raise HTTPException(422, "Work title is required")
    existing = db.get(WorkPackage, body.id)
    if existing:
        if (existing.project_id, existing.element_id, existing.assignee_id, existing.state["title"]) != (
                project_id, body.element_id, body.assignee_id, body.title.strip()):
            raise HTTPException(409, "Work identity already exists")
        return flow.item(existing)
    work = WorkPackage(id=body.id, project_id=project_id, element_id=rev.element_id,
                       version_id=body.model_version_id, assignee_id=person.id, revision=1, state={
        "id": body.id, "title": body.title.strip(), "owner": person.name, "trade": rev.trade,
        "unit": loc["spaceCode"] or loc["levelName"], "level": 0, "location": loc,
        "status": "none", "processing": "completed", "update": "", "time": "",
        "reference": f"Approved IFC · revision {body.model_version_id} · element {rev.element_id}",
        "scope": f"Linked component only: {rev.name or rev.ifc_class}",
        "captureGuidance": body.capture_guidance, "limits": "Hidden conditions, exact measurements, code compliance and formal inspection",
        "detail": "Planned work. No field evidence or completion recorded.", "photos": [], "checks": [],
        "coverage": "No evidence", "progress": "Not assessed", "review": "Not requested", "inspection": "Not recorded"})
    db.add(work)
    try:
        db.flush()
        flow.record(db, work, user, "planned", "Planned work assigned. No field evidence received.")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This component already has tracked work") from None
    return flow.item(work)


async def _prepared(files: list[UploadFile]):
    if not 1 <= len(files) <= 6:
        raise HTTPException(422, "Attach between one and six photos")
    prepared = []
    for file in files:
        data = await file.read(25 * 1024 * 1024 + 1)
        if len(data) > 25 * 1024 * 1024:
            raise HTTPException(413, "Photo exceeds 25 MB")
        try:
            meta = inspect_photo(data)
        except (ValueError, OSError):
            raise HTTPException(422, "Attach a readable photo") from None
        if meta["content_type"] not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(422, "Use JPEG, PNG or WebP photos")
        prepared.append((file.filename or "Photo", data, meta))
    return prepared


@router.post("/work/{work_id}/updates", status_code=201)
async def submit(work_id: str, client_uuid: str = Form(..., min_length=1, max_length=64),
                 model_version_id: str = Form(...), confirmed: bool = Form(...),
                 captured_by: str = Form(...),
                 note: str = Form(..., min_length=1, max_length=5000), claim: str = Form("", max_length=100),
                 captured_at: datetime = Form(...), files: list[UploadFile] = File(...),
                 capture: str = Form("", max_length=20000),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    work, _ = flow.load(db, work_id, user, Perm.progress_upload)
    if captured_by != user.id:
        raise HTTPException(403, "Sign in as the account that captured this update")
    if not confirmed or not note.strip():
        raise HTTPException(422, "Confirm the location and describe the update")
    try:
        capture_data = Capture.model_validate_json(capture).model_dump(mode="json") if capture.strip() else None
    except ValueError:
        raise HTTPException(422, "Capture metadata (measurements, location, device) is invalid") from None
    prepared = await _prepared(files)
    digest = hashlib.sha256(json.dumps({"work": work_id, "actor": user.id, "model": model_version_id,
                                       "note": note, "claim": claim, "captured_at": captured_at.isoformat(),
                                       "photos": [m["sha256"] for _, _, m in prepared], "capture": capture_data},
                                      sort_keys=True).encode()).hexdigest()

    def duplicate():
        up = db.scalar(select(Upload).where(Upload.project_id == work.project_id, Upload.client_uuid == client_uuid))
        receipt = up and db.scalar(select(WorkSubmission).where(WorkSubmission.upload_id == up.id))
        if up:
            if not receipt or up.user_id != user.id or receipt.work_id != work.id or receipt.payload_hash != digest:
                raise HTTPException(409, "Submission identity was already used for different evidence")
            return {"upload_id": up.id, "client_uuid": up.client_uuid, "received": True}
        return None
    prior = duplicate()
    if prior:
        return prior
    flow.current(db, work)
    if model_version_id != work.version_id:
        raise HTTPException(409, "Capture reference changed. Reconfirm against the current model before resubmitting.")
    up = Upload(id=new_id(), project_id=work.project_id, zone_id=work.state["location"]["roomId"],
                trade=work.state["trade"], user_id=user.id, note=note, client_uuid=client_uuid,
                captured_at=captured_at, analysis_status="off")
    keys = []
    try:
        db.add(up)
        db.flush()
        photos = []
        for name, data, meta in prepared:
            key = f"projects/{work.project_id}/photos/{up.id}/{new_id()}"
            keys.append(get_storage().put_bytes(key, data))
            photo = Photo(id=new_id(), upload_id=up.id, project_id=work.project_id, zone_id=up.zone_id,
                          storage_key=key, size=len(data), flags=[], **meta)
            db.add(photo)
            photos.append({"id": photo.id, "url": f"/api/photos/{photo.id}", "name": name[:300], "sample": False})
        reference = {k: deepcopy(work.state[k]) for k in ("location", "reference", "scope", "captureGuidance")}
        receipt = WorkSubmission(work_id=work.id, upload_id=up.id, payload_hash=digest, reference=reference, claim=claim,
                                 capture=capture_data)
        db.add(receipt)
        state = deepcopy(work.state)
        state.setdefault("assessments", []).append({k: deepcopy(state[k]) for k in
                                                    ("update", "reference", "checks", "coverage", "progress", "photos")}
                                                   | {"at": utcnow().isoformat()})
        state.update(update=up.id, photos=state["photos"] + photos, claimed=claim, checks=[],
                     processing="review", status="issue" if state.get("issue") else "review",
                     correction=bool(state.get("issue")), review="Awaiting review of new evidence",
                     progress="Not assessed", coverage="Awaiting manual review",
                     time=utcnow().isoformat(), detail=note)
        flow.save(db, work, state, work.revision)
        flow.project_progress(db, work, user)
        queued = ai_check.maybe_enqueue(db, work, up, receipt)
        flow.record(db, work, user, "submitted", f"{note} · Worker claim: {claim or 'Not specified'}. "
                    + ("AI check queued; project-manager review required." if queued else "Manual review required."))
        db.commit()
    except Exception as exc:
        db.rollback()
        for key in keys:
            get_storage().local_path(key).unlink(missing_ok=True)
        if isinstance(exc, IntegrityError):
            prior = duplicate()
            if prior:
                return prior
            raise HTTPException(409, "Work changed during upload. Retry with the same submission identity.") from None
        raise
    if queued:
        jobs.after_commit_run_inline(SessionLocal)
    return {"upload_id": up.id, "client_uuid": client_uuid, "received": True}


@router.post("/work/{work_id}/decisions")
def decision(work_id: str, body: DecisionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    work, _ = flow.load(db, work_id, user, Perm.progress_approve)
    if not body.reason.strip():
        raise HTTPException(422, "Decision reason is required")
    if work.revision != body.expected_revision or work.state["update"] != (body.update_id or ""):
        raise HTTPException(409, "Work changed. Refresh and review the latest evidence before saving.")
    state = deepcopy(work.state)
    if body.type == "reference":
        rev, loc = flow.source(db, work.project_id, db.get(Project, work.project_id).current_version_id, work.element_id)
        flow.assignee(db, work.project_id, work.assignee_id, rev.trade, rev.zone_id)
        state.update(location=loc, trade=rev.trade, reference=f"Approved IFC · revision {loc['version']} · element {rev.element_id}",
                     status="issue" if state.get("issue") else "review", progress="Not assessed",
                     review="Reference reconfirmed; fresh evidence required", update="", correction=False)
        flow.save(db, work, state, body.expected_revision, version_id=loc["version"])
    else:
        flow.current(db, work)
        upload = db.get(Upload, state["update"]) if state["update"] else None
        receipt = upload and db.scalar(select(WorkSubmission).where(WorkSubmission.upload_id == upload.id))
        if body.type in ("accept", "resolve") and (
            not receipt or receipt.reference["location"]["version"] != work.version_id
            or not db.scalar(select(Photo.id).where(Photo.upload_id == upload.id))
        ):
            raise HTTPException(422, "Review fresh photo evidence against this approved reference first")
        others = db.scalar(select(func.count()).where(Issue.element_id == work.element_id,
                    Issue.status.in_(OPEN_ISSUE_STATUSES), Issue.id != (work.issue_id or "")))
        if body.type == "accept":
            if state.get("issue") or others:
                raise HTTPException(409, "Resolve open issues before accepting work")
            state.update(status="human", progress="Human accepted", review=f"Accepted by {user.name}")
        elif body.type == "resolve":
            if not state.get("issue") or not state.get("correction") or others:
                raise HTTPException(409, "Fresh correction evidence and resolution of other open issues are required")
            issue = db.get(Issue, work.issue_id)
            issue.status, issue.closed_at, issue.updated_at = IssueStatus.closed, utcnow(), utcnow()
            state.pop("issue", None)
            state.update(status="human", progress="Human accepted", correction=False, review=f"Correction accepted by {user.name}")
        elif body.type in ("assign", "confirm"):
            if not body.assignee_id:
                raise HTTPException(422, "Select a responsible project member")
            flow.due_date(body.due)
            person = flow.assignee(db, work.project_id, body.assignee_id, state["trade"], state["location"]["roomId"])
            state.update(owner=person.name, due=body.due)
            if body.type == "confirm":
                if state.get("issue"):
                    raise HTTPException(409, "This work already has an issue")
                number = (db.scalar(select(func.max(Issue.number)).where(Issue.project_id == work.project_id)) or 0) + 1
                issue = Issue(id=new_id(), project_id=work.project_id, number=number, title=state["title"],
                              description=body.reason, trade=state["trade"], assignee_id=person.id,
                              due_date=body.due, element_id=work.element_id, zone_id=state["location"]["roomId"],
                              level_id=state["location"]["levelId"], anchor=state["location"]["anchor"],
                              model_version_id=work.version_id, created_by=user.id)
                db.add(issue)
                db.flush()
                work.issue_id = issue.id
                state.update(issue=issue.id, status="issue", progress="Not assessed", correction=False,
                             resolution=body.reason, review=f"Issue confirmed by {user.name}")
            elif work.issue_id and state.get("issue"):
                issue = db.get(Issue, work.issue_id)
                issue.assignee_id, issue.due_date = person.id, body.due
            flow.save(db, work, state, body.expected_revision, assignee_id=person.id)
        elif body.type == "request":
            state.update(status="issue" if state.get("issue") else "evidence", detail=body.reason,
                         progress="Not assessed", review="Additional evidence requested", correction=False)
        elif body.type == "reject":
            state.update(status="issue" if state.get("issue") else "review", correction=False,
                         progress="Not assessed", review=f"Correction returned by {user.name}", detail=body.reason)
        elif body.type == "reopen":
            state.update(status="issue" if state.get("issue") else "review", progress="Not assessed", review=f"Reopened by {user.name}")
        elif body.type == "dismiss":
            if state.get("issue"):
                raise HTTPException(409, "Use the explicit correction-resolution workflow")
            state.update(status="review", dismissed=True, review=f"Finding dismissed by {user.name}", progress="Not assessed")
        if body.type not in ("assign", "confirm"):
            flow.save(db, work, state, body.expected_revision)
    basis = ""
    if body.assessment_id:
        run = db.get(WorkAssessment, body.assessment_id)
        if not run or run.work_id != work.id or run.upload_id != (body.update_id or "") or run.status != "completed":
            raise HTTPException(409, "That AI check is not the current suggestion for this work")
        basis = f" (PM decision after reviewing AI check {run.id[:8]}; AI suggested {run.result['suggestion']['outcome'].replace('_', ' ')})"
    flow.project_progress(db, work, user)
    flow.record(db, work, user, body.type, f"{body.type}: {body.reason}{basis}")
    db.commit()
    return flow.item(work)
