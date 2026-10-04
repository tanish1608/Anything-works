import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.auth.deps import current_user
from app.conversion.detect import counts
from app.conversion.edits import EditError, apply_ops
from app.conversion.layers import ROLES
from app.db import SessionLocal, get_db
from app.disciplines import DISCIPLINES, trade_for
from app.models import Building, DrawingSheet, Level, ProjectMember, Role, User
from app.rbac import Perm, require
from app.schemas import BuildIn, EditsIn, JobOut, SheetDetail, SheetOut, SheetPatch
from app.services import conversion, events
from app.storage import get_storage

router = APIRouter(tags=["drawings"])
MAX_DRAWING = 100 * 1024 * 1024
SHEET_DISCIPLINES = ("architecture", "structure", "plumbing", "electrical", "hvac")


def _out(s: DrawingSheet, cls=SheetOut):
    plan = s.plan or {}
    extra = {"counts": counts(plan) if plan else None, "warnings": plan.get("warnings", []),
             "review_open": len(plan.get("review", []))}
    return cls.model_validate(s).model_copy(update=extra) if cls is SheetOut else cls(
        **SheetOut.model_validate(s).model_dump() | extra, plan=s.plan)


def _sheet_visible(m: ProjectMember, s: DrawingSheet) -> bool:
    return m.role != Role.trade or s.discipline == "architecture" or trade_for(s.discipline) in m.trades \
        or s.discipline in m.trades


def _load(db: Session, sheet_id: str, user: User, perm: Perm = Perm.project_view) -> tuple[DrawingSheet, ProjectMember]:
    s = db.get(DrawingSheet, sheet_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found")
    m = require(db, s.project_id, user.id, perm)
    if not _sheet_visible(m, s):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found")
    return s, m


def _check_level(db: Session, project_id: str, level_id: str | None) -> None:
    if level_id is None:
        return
    lv = db.get(Level, level_id)
    if lv is None or db.get(Building, lv.building_id).project_id != project_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown level")


def _enqueue_detect(db: Session, s: DrawingSheet, user_id: str):
    s.status = "detecting"
    return jobs.enqueue(db, "sheet_detect", {"sheet_id": s.id}, s.project_id, user_id)


@router.post("/projects/{project_id}/sheets", response_model=JobOut, status_code=202)
async def upload_sheet(project_id: str, file: UploadFile = File(...), discipline: str = Form(...),
                       level_id: str | None = Form(None), name: str = Form(""), user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    require(db, project_id, user.id, Perm.drawings_upload)
    fname = file.filename or "drawing"
    ext = fname.lower().rsplit(".", 1)[-1]
    if ext == "dwg":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "DWG isn't supported. In AutoCAD use SAVEAS → DXF (any version) and upload the .dxf.")
    if ext not in ("dxf", "pdf"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a .dxf (or vector .pdf) drawing")
    if discipline not in SHEET_DISCIPLINES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"discipline must be one of {SHEET_DISCIPLINES}")
    _check_level(db, project_id, level_id or None)
    data = await file.read()
    if len(data) > MAX_DRAWING:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Drawing too large")
    if ext == "pdf" and not data.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Not a PDF file")
    s = DrawingSheet(project_id=project_id, level_id=level_id or None, discipline=discipline, name=name or fname,
                     filename=fname, file_type=ext, created_by=user.id,
                     storage_key=f"projects/{project_id}/sheets/{uuid.uuid4().hex}/{uuid.uuid4().hex[:6]}.{ext}")
    get_storage().put_bytes(s.storage_key, data)
    db.add(s)
    db.flush()
    job = _enqueue_detect(db, s, user.id)
    events.record(db, project_id=project_id, actor_id=user.id, type="sheet.uploaded", entity_type="sheet",
                  entity_id=s.id, data={"name": s.name, "discipline": discipline, "level_id": s.level_id})
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(job)
    return job


@router.get("/projects/{project_id}/sheets", response_model=list[SheetOut])
def list_sheets(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    rows = db.scalars(select(DrawingSheet).where(DrawingSheet.project_id == project_id).order_by(DrawingSheet.created_at))
    return [_out(s) for s in rows if _sheet_visible(m, s)]


@router.get("/sheets/{sheet_id}", response_model=SheetDetail)
def get_sheet(sheet_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, _ = _load(db, sheet_id, user)
    return _out(s, SheetDetail)


@router.get("/sheets/{sheet_id}/svg")
def sheet_svg(sheet_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, _ = _load(db, sheet_id, user)
    key = conversion.svg_key(s)
    if not get_storage().exists(key):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sheet not rendered yet")
    return Response(get_storage().get_bytes(key), media_type="image/svg+xml",
                    headers={"Cache-Control": "private, max-age=60"})


@router.get("/sheets/{sheet_id}/file")
def sheet_file(sheet_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, _ = _load(db, sheet_id, user)
    safe = "".join(c for c in s.filename if c.isalnum() or c in "._- ") or f"drawing.{s.file_type}"
    return Response(get_storage().get_bytes(s.storage_key), media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{safe}"'})


@router.patch("/sheets/{sheet_id}", response_model=SheetOut)
def update_sheet(sheet_id: str, body: SheetPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, _ = _load(db, sheet_id, user, Perm.conversion_review)
    changes = body.model_dump(exclude_unset=True)
    rerun = False
    if "level_id" in changes:
        _check_level(db, s.project_id, changes["level_id"])
        s.level_id = changes["level_id"]
    if "name" in changes and changes["name"]:
        s.name = changes["name"]
    if "discipline" in changes:
        if changes["discipline"] not in SHEET_DISCIPLINES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown discipline")
        rerun |= changes["discipline"] != s.discipline
        s.discipline = changes["discipline"]
    if "unit_m" in changes and changes["unit_m"]:
        rerun |= abs((s.unit_m or 0) - changes["unit_m"]) > 1e-12 or not s.units_confirmed
        s.unit_m, s.units_confirmed = changes["unit_m"], True
    if "layer_roles" in changes and changes["layer_roles"] is not None:
        bad = {v for v in changes["layer_roles"].values() if v not in ROLES}
        if bad:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown roles {sorted(bad)}")
        s.layer_roles = {**(s.layer_roles or {}), **changes["layer_roles"]}
        rerun = True
    if "transform" in changes and changes["transform"] is not None:
        t = changes["transform"]
        if "reference" in t:  # the picked point becomes the building origin
            rx, ry = t["reference"]
            t = {"dx": -float(rx), "dy": -float(ry), "rotation_deg": float(t.get("rotation_deg", 0)),
                 "reference": [rx, ry]}
        s.transform = {"dx": float(t.get("dx", 0)), "dy": float(t.get("dy", 0)),
                       "rotation_deg": float(t.get("rotation_deg", 0)), "reference": t.get("reference"),
                       "confirmed": True}
    s.updated_at = datetime.now(UTC)
    events.record(db, project_id=s.project_id, actor_id=user.id, type="sheet.updated", entity_type="sheet",
                  entity_id=s.id, data={k: v for k, v in changes.items()})
    if rerun:
        _enqueue_detect(db, s, user.id)
    db.commit()
    if rerun:
        jobs.after_commit_run_inline(SessionLocal)
        db.refresh(s)
    return _out(s)


@router.post("/sheets/{sheet_id}/detect", response_model=JobOut, status_code=202)
def redetect(sheet_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Re-run detection from the drawing. Discards review edits on this sheet."""
    s, _ = _load(db, sheet_id, user, Perm.conversion_review)
    job = _enqueue_detect(db, s, user.id)
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(job)
    return job


@router.post("/sheets/{sheet_id}/edits", response_model=SheetDetail)
def edit_plan(sheet_id: str, body: EditsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, _ = _load(db, sheet_id, user, Perm.conversion_review)
    if s.status != "detected" or not s.plan:
        raise HTTPException(status.HTTP_409_CONFLICT, "Drawing hasn't been processed yet")
    try:
        plan, c = apply_ops(s.plan, body.ops)
    except (EditError, KeyError, TypeError, ValueError) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid edit: {e}") from None
    plan["counts"] = counts(plan)
    s.plan = plan
    s.corrections = {k: (s.corrections or {}).get(k, 0) + v for k, v in c.items()}
    s.updated_at = datetime.now(UTC)
    events.record(db, project_id=s.project_id, actor_id=user.id, type="sheet.edited", entity_type="sheet",
                  entity_id=s.id, data={"ops": body.ops[:50], "corrections": c})
    db.commit()
    return _out(s, SheetDetail)


@router.post("/projects/{project_id}/conversions", response_model=JobOut, status_code=202)
def build_model(project_id: str, body: BuildIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Build a draft model version from all processed drawings (or the given levels). It stays a draft until
    a manager approves it on the 3D model page."""
    require(db, project_id, user.id, Perm.conversion_review)
    job = jobs.enqueue(db, "model_build", body.model_dump(), project_id, user.id)
    events.record(db, project_id=project_id, actor_id=user.id, type="conversion.started", entity_type="job",
                  entity_id=job.id, data=body.model_dump())
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(job)
    return job


@router.get("/meta/layer-roles")
def layer_roles():
    return {"roles": ROLES, "disciplines": [d for d in DISCIPLINES if d in SHEET_DISCIPLINES]}
