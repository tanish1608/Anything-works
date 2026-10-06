import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.auth.deps import current_user
from app.bim.ifc_import import import_ifc
from app.db import SessionLocal, get_db
from app.disciplines import DISCIPLINES
from app.models import Element, ElementRevision, Event, Job, ModelVersion, Project, Role, User, Verification
from app.rbac import Perm, require, zone_visible
from app.schemas import (
    ApproveIn,
    ElementDetail,
    ElementOut,
    EventOut,
    JobOut,
    MeshLayer,
    ModelVersionOut,
    ViewerManifest,
)
from app.services import events
from app.services.history import diff_versions, merge_branch, timeline
from app.services.models import approve_version, element_visible, resolve_version, visible_disciplines
from app.storage import get_storage

router = APIRouter(tags=["models"])
MAX_UPLOAD = 300 * 1024 * 1024


@jobs.handler("ifc_import")
def _run_import(db: Session, job: Job) -> dict:
    p = job.payload
    project = db.get(Project, job.project_id)
    v = import_ifc(db, project, [(f["key"], f.get("discipline")) for f in p["files"]], actor_id=job.created_by,
                   message=p.get("message") or "Imported IFC model")
    v.branch = p.get("branch") or "main"
    db.commit()
    return {"version_id": v.id, "number": v.number, "stats": v.stats}


def _version_out(v: ModelVersion, project: Project) -> ModelVersionOut:
    return ModelVersionOut.model_validate(v).model_copy(update={"is_current": v.id == project.current_version_id})


@router.post("/projects/{project_id}/models/import", response_model=JobOut, status_code=202)
async def import_model(project_id: str, files: list[UploadFile] = File(...), message: str = Form(""),
                       disciplines: str = Form(""), branch: str = Form("main"), user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    """Upload one or more IFC files (a federated model). `disciplines` optionally gives a comma-separated
    discipline per file (blank = infer from IFC classes). Creates a draft version to review and approve."""
    require(db, project_id, user.id, Perm.drawings_upload)
    hints = [h.strip() or None for h in disciplines.split(",")] if disciplines else []
    stored = []
    batch = uuid.uuid4().hex[:12]
    for i, f in enumerate(files):
        if not (f.filename or "").lower().endswith(".ifc"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{f.filename}: only .ifc files are accepted")
        data = await f.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{f.filename} is too large")
        if not data.lstrip().startswith(b"ISO-10303-21"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{f.filename} is not an IFC (STEP) file")
        safe = "".join(c for c in f.filename if c.isalnum() or c in "._-") or f"model{i}.ifc"
        key = get_storage().put_bytes(f"projects/{project_id}/uploads/{batch}/{i}-{safe}", data)
        hint = hints[i] if i < len(hints) else None
        if hint and hint not in DISCIPLINES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"unknown discipline {hint}")
        stored.append({"key": key, "name": f.filename, "discipline": hint})
    job = jobs.enqueue(db, "ifc_import", {"files": stored, "message": message, "branch": branch or "main"}, project_id, user.id)
    events.record(db, project_id=project_id, actor_id=user.id, type="model.uploaded", entity_type="job",
                  entity_id=job.id, data={"files": [s["name"] for s in stored]})
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is None or job.project_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    require(db, job.project_id, user.id, Perm.project_view)
    return job


@router.get("/projects/{project_id}/models", response_model=list[ModelVersionOut])
def list_versions(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    q = select(ModelVersion).where(ModelVersion.project_id == project_id)
    if m.role not in (Role.owner, Role.pm):
        q = q.where(ModelVersion.status == "approved")
    project = db.get(Project, project_id)
    return [_version_out(v, project) for v in db.scalars(q.order_by(ModelVersion.number.desc()))]


def _load_version(db: Session, version_id: str) -> ModelVersion:
    v = db.get(ModelVersion, version_id)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model version not found")
    return v


@router.post("/models/{version_id}/approve", response_model=ModelVersionOut)
def approve(version_id: str, body: ApproveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_version(db, version_id)
    require(db, v.project_id, user.id, Perm.model_approve)
    approve_version(db, v, user.id, body.message)
    db.commit()
    return _version_out(v, db.get(Project, v.project_id))


@router.post("/models/{version_id}/reject", response_model=ModelVersionOut)
def reject(version_id: str, body: ApproveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_version(db, version_id)
    require(db, v.project_id, user.id, Perm.model_approve)
    if v.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Version is {v.status}, not draft")
    v.status = "rejected"
    events.record(db, project_id=v.project_id, actor_id=user.id, type="model.rejected", entity_type="model_version",
                  entity_id=v.id, message=body.message, data={"number": v.number})
    db.commit()
    return _version_out(v, db.get(Project, v.project_id))


@router.get("/projects/{project_id}/viewer", response_model=ViewerManifest)
def viewer_manifest(project_id: str, version: str | None = None, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    v = resolve_version(db, project_id, m, version)
    if v is None:
        return ViewerManifest(version=None, layers=[])
    meshes = (v.files or {}).get("meshes", {})
    vis = visible_disciplines(db, m, list(meshes))
    layers = [MeshLayer(discipline=d, url=f"/api/models/{v.id}/meshes/{d}.glb", context=vis[d])
              for d in DISCIPLINES if d in meshes and d in vis]
    return ViewerManifest(version=_version_out(v, db.get(Project, project_id)), layers=layers)


@router.get("/models/{version_id}/meshes/{discipline}.glb")
def mesh(version_id: str, discipline: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_version(db, version_id)
    m = require(db, v.project_id, user.id, Perm.project_view)
    resolve_version(db, v.project_id, m, v.id)
    key = (v.files or {}).get("meshes", {}).get(discipline)
    if key is None or discipline not in visible_disciplines(db, m, [discipline]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layer not found")
    return FileResponse(get_storage().local_path(key), media_type="model/gltf-binary",
                        headers={"Cache-Control": "private, max-age=86400"})


@router.get("/models/{version_id}/plans/{level_id}")
def model_plan(version_id: str, level_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_version(db, version_id)
    member = require(db, v.project_id, user.id, Perm.project_view)
    resolve_version(db, v.project_id, member, v.id)
    key = (v.files or {}).get("plans", {}).get(level_id)
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No model-derived plan for this level")
    data = json.loads(get_storage().get_bytes(key))
    visible = {e.id for e in element_rows(db, v.project_id, member, v)}
    data["elements"] = [e for e in data["elements"] if e["id"] in visible]
    data["rooms"] = [z for z in data["rooms"] if zone_visible(member, z["id"])]
    return data


def element_rows(db: Session, project_id: str, member, version: ModelVersion) -> list[ElementOut]:
    from app.bim.envelope import exterior_wall, roof_element
    from app.services.issues import open_issue_counts  # M2

    vis = visible_disciplines(db, member, DISCIPLINES)
    counts = open_issue_counts(db, project_id)
    rows = db.execute(select(ElementRevision, Element).join(Element, Element.id == ElementRevision.element_id)
                      .where(ElementRevision.version_id == version.id)).all()
    basis = completion_basis(db, project_id)
    out = []
    for rev, el in rows:
        if rev.discipline not in vis or not element_visible(member, rev, vis):
            continue
        out.append(ElementOut(id=el.id, ifc_guid=el.ifc_guid, name=rev.name, ifc_class=rev.ifc_class,
                              discipline=rev.discipline, trade=rev.trade, level_id=rev.level_id, zone_id=rev.zone_id,
                              bbox=rev.bbox, status=el.status.value, flags=el.flags or [], source=rev.source,
                              confidence=rev.confidence, open_issues=counts.get(el.id, 0), context=vis[rev.discipline],
                              completion_basis=basis.get(el.id) if el.status.value == "done" else None,
                              exterior_wall=exterior_wall(rev.ifc_class, rev.props),
                              roof=roof_element(rev.ifc_class, rev.props, rev.name)))
    return out


def completion_basis(db: Session, project_id: str) -> dict[str, str]:
    """Expose actual legacy decision provenance; never relabel an AI auto-approval as a human review."""
    out = {}
    for v in db.scalars(select(Verification).where(Verification.project_id == project_id, Verification.state == "approved")
                        .order_by(Verification.confirmed_at.desc(), Verification.created_at.desc())):
        if v.element_id not in out:
            out[v.element_id] = "human" if v.confirmed_by else "legacy_ai" if v.source == "ai" else "legacy"
    return out


@router.get("/projects/{project_id}/elements", response_model=list[ElementOut])
def list_elements(project_id: str, version: str | None = None, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    v = resolve_version(db, project_id, m, version)
    return [] if v is None else element_rows(db, project_id, m, v)


@router.get("/elements/{element_id}", response_model=ElementDetail)
def element_detail(element_id: str, version: str | None = None, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    from app.bim.envelope import exterior_wall, roof_element
    el = db.get(Element, element_id)
    if el is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Element not found")
    m = require(db, el.project_id, user.id, Perm.project_view)
    v = resolve_version(db, el.project_id, m, version)
    rev = v and db.scalar(select(ElementRevision).where(ElementRevision.version_id == v.id,
                                                        ElementRevision.element_id == el.id))
    if rev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Element not in this model version")
    vis = visible_disciplines(db, m, DISCIPLINES)
    if rev.discipline not in vis or not element_visible(m, rev, vis):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Element not found")
    from app.services.issues import open_issue_counts

    hist = db.execute(select(Event, User.name).outerjoin(User, User.id == Event.actor_id)
                      .where(Event.project_id == el.project_id, Event.entity_id == el.id)
                      .order_by(Event.id.desc()).limit(100)).all()
    return ElementDetail(id=el.id, ifc_guid=el.ifc_guid, name=rev.name, ifc_class=rev.ifc_class,
                         discipline=rev.discipline, trade=rev.trade, level_id=rev.level_id, zone_id=rev.zone_id,
                         bbox=rev.bbox, status=el.status.value, flags=el.flags or [], source=rev.source,
                         confidence=rev.confidence, props=rev.props or {}, context=vis[rev.discipline],
                         completion_basis=completion_basis(db, el.project_id).get(el.id) if el.status.value == "done" else None,
                         exterior_wall=exterior_wall(rev.ifc_class, rev.props),
                         roof=roof_element(rev.ifc_class, rev.props, rev.name),
                         open_issues=open_issue_counts(db, el.project_id).get(el.id, 0),
                         history=[EventOut.model_validate(e).model_copy(update={"actor_name": n}) for e, n in hist])


@router.get("/projects/{project_id}/models/diff")
def model_diff(project_id: str, from_: str = Query(..., alias="from"), to: str = Query(...),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.history_view)
    a, b = resolve_version(db, project_id, m, from_), resolve_version(db, project_id, m, to)
    d = diff_versions(db, a, b)
    if m.role == Role.trade:  # only what this trade member can see
        vis = visible_disciplines(db, m, DISCIPLINES)
        for k in ("added", "removed", "moved", "changed"):
            d[k] = [r for r in d[k] if r["discipline"] in vis and vis[r["discipline"]] is False]
    return d


@router.get("/projects/{project_id}/timeline")
def project_timeline(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.history_view)
    project = db.get(Project, project_id)
    visible = None
    if m.role == Role.trade and project.current_version_id:
        visible = {e.id for e in element_rows(db, project_id, m, db.get(ModelVersion, project.current_version_id))}
    return timeline(db, project, visible)


@router.post("/models/{version_id}/merge", response_model=ModelVersionOut)
def merge(version_id: str, body: ApproveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_version(db, version_id)
    require(db, v.project_id, user.id, Perm.model_approve)
    merged = merge_branch(db, v, user.id, body.message)
    db.commit()
    return _version_out(merged, db.get(Project, v.project_id))
