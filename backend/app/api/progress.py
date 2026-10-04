import io
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.auth.deps import current_user
from app.db import SessionLocal, get_db
from app.models import (
    Element,
    ElementRevision,
    ElementStatus,
    Photo,
    Project,
    ProjectMember,
    Role,
    Upload,
    User,
    Verification,
    Zone,
)
from app.rbac import Perm, require, zone_visible
from app.schemas import PhotoOut, ReviewIn, StatusIn, UploadOut, VerificationOut
from app.services import events, progress
from app.services.notify import notify
from app.services.photos import hamming, inspect_photo
from app.services.structure import project_of_zone
from app.storage import get_storage

router = APIRouter(tags=["progress"])
MAX_PHOTO = 25 * 1024 * 1024
NEAR_DUP = 6  # dHash bits


def _photo_out(p: Photo) -> PhotoOut:
    return PhotoOut.model_validate(p).model_copy(update={"url": f"/api/photos/{p.id}", "thumb_url": f"/api/photos/{p.id}?thumb=1"})


def _upload_out(db: Session, u: Upload, with_children=True) -> UploadOut:
    out = UploadOut.model_validate(u)
    upd: dict = {"user_name": db.scalar(select(User.name).where(User.id == u.user_id)) if u.user_id else None,
                 "zone_name": db.scalar(select(Zone.name).where(Zone.id == u.zone_id)) if u.zone_id else None}
    if with_children:
        upd["photos"] = [_photo_out(p) for p in db.scalars(select(Photo).where(Photo.upload_id == u.id).order_by(Photo.created_at))]
        upd["verifications"] = _ver_out(db, list(db.scalars(select(Verification).where(Verification.upload_id == u.id)
                                                            .order_by(Verification.created_at))))
    return out.model_copy(update=upd)


def _ver_out(db: Session, vs: list[Verification]) -> list[VerificationOut]:
    out = []
    for v in vs:
        project = db.get(Project, v.project_id)
        rev = project.current_version_id and db.scalar(select(ElementRevision).where(
            ElementRevision.version_id == project.current_version_id, ElementRevision.element_id == v.element_id))
        out.append(VerificationOut.model_validate(v).model_copy(update={
            "element_name": rev.name if rev else None, "element_class": rev.ifc_class if rev else None}))
    return out


@router.get("/zones/{zone_id}/checklist")
def zone_checklist(zone_id: str, trade: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    z = db.get(Zone, zone_id)
    if z is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zone not found")
    pid = project_of_zone(db, z)
    m = require(db, pid, user.id, Perm.project_view)
    return {"zone": {"id": z.id, "name": z.name, "level_id": z.level_id, "polygon": z.polygon},
            "items": progress.checklist(db, db.get(Project, pid), m, zone_id, trade)}


@router.post("/projects/{project_id}/uploads", response_model=UploadOut, status_code=201)
async def create_upload(project_id: str, zone_id: str = Form(...), trade: str = Form(...), note: str = Form(""),
                        client_uuid: str = Form(...), captured_at: str | None = Form(None),
                        element_ids: str = Form("[]"), files: list[UploadFile] = File(...),
                        reference: UploadFile | None = File(None),
                        user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Field report. Idempotent on client_uuid so the offline queue can safely retry."""
    m = require(db, project_id, user.id, Perm.progress_upload)
    existing = db.scalar(select(Upload).where(Upload.project_id == project_id, Upload.client_uuid == client_uuid))
    if existing:
        return _upload_out(db, existing)
    z = db.get(Zone, zone_id)
    if z is None or project_of_zone(db, z) != project_id or not zone_visible(m, zone_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown zone")
    if m.role == Role.trade and trade not in m.trades:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only report progress for your trade")
    if not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "At least one photo is required")
    try:
        claimed = [str(x) for x in json.loads(element_ids or "[]")]
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "element_ids must be a JSON list") from None
    project = db.get(Project, project_id)
    allowed = {r["id"] for r in progress.checklist(db, project, m, zone_id, trade)}
    bad = set(claimed) - allowed
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Elements not on this zone's {trade} checklist: {sorted(bad)}")
    when = None
    if captured_at:
        try:
            when = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except ValueError:
            when = None
    up = Upload(project_id=project_id, zone_id=zone_id, trade=trade, user_id=user.id, note=note[:5000],
                client_uuid=client_uuid[:64], captured_at=when)
    db.add(up)
    db.flush()

    existing_photos = db.execute(select(Photo.id, Photo.sha256, Photo.phash, Photo.zone_id, Photo.created_at)
                                 .where(Photo.project_id == project_id)).all()
    today = (when or datetime.now()).date()
    photos = []
    for f in files:
        data = await f.read()
        if len(data) > MAX_PHOTO:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{f.filename} is too large")
        try:
            meta = inspect_photo(data)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{f.filename} is not a photo") from None
        flags = []
        for pid_, sha, ph, zid, created in existing_photos:
            same_day = created.date() == today
            if sha == meta["sha256"] and (zid != zone_id or not same_day):
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    f"{f.filename} was already submitted for another day or zone. Take a new photo.")
            if ph and meta["phash"] and hamming(ph, meta["phash"]) <= NEAR_DUP and (zid != zone_id or not same_day):
                flags.append(f"possible_reuse:{pid_}")
        key = get_storage().put_bytes(f"projects/{project_id}/photos/{up.id}/{uuid.uuid4().hex}", data)
        p = Photo(upload_id=up.id, project_id=project_id, zone_id=zone_id, storage_key=key, size=len(data),
                  flags=flags[:5], **meta)
        db.add(p)
        photos.append(p)
    if reference is not None:
        ref = await reference.read()
        if 0 < len(ref) <= MAX_PHOTO:
            up.reference_key = get_storage().put_bytes(f"projects/{project_id}/photos/{up.id}/reference.jpg", ref)
    db.flush()
    progress.claim(db, up, claimed, user.id)
    events.record(db, project_id=project_id, actor_id=user.id, type="upload.created", entity_type="upload",
                  entity_id=up.id, zone_id=zone_id, evidence_ids=[p.id for p in photos],
                  data={"trade": trade, "photos": len(photos), "claimed": len(claimed), "note": note[:200],
                        "flags": sorted({f.split(':')[0] for p in photos for f in p.flags})})
    managers = db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id,
                                                              ProjectMember.role.in_([Role.pm, Role.owner])))
    notify(db, managers, actor_id=user.id, project_id=project_id, kind="progress.submitted",
           title=f"{user.name}: {len(claimed)} item(s) to review in {z.name}", body=note[:200],
           link=f"/p/{project_id}/progress?upload={up.id}")
    from app.services.vision_jobs import maybe_enqueue_analysis  # M5

    maybe_enqueue_analysis(db, up)
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(up)
    return _upload_out(db, up)


@router.get("/projects/{project_id}/uploads", response_model=list[UploadOut])
def list_uploads(project_id: str, zone_id: str | None = None, mine: bool = False, limit: int = 50,
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.history_view)
    q = select(Upload).where(Upload.project_id == project_id)
    if zone_id:
        q = q.where(Upload.zone_id == zone_id)
    if mine or m.role == Role.trade:
        q = q.where(Upload.user_id == user.id) if mine or m.zone_ids is not None else q.where(Upload.trade.in_(m.trades))
    rows = db.scalars(q.order_by(Upload.created_at.desc()).limit(min(limit, 200)))
    return [_upload_out(db, u) for u in rows if u.zone_id is None or zone_visible(m, u.zone_id)]


def _load_upload(db: Session, upload_id: str, user: User) -> tuple[Upload, ProjectMember]:
    u = db.get(Upload, upload_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    m = require(db, u.project_id, user.id, Perm.history_view)
    if m.role == Role.trade and u.user_id != user.id and (u.trade not in m.trades or (u.zone_id and not zone_visible(m, u.zone_id))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    return u, m


@router.get("/uploads/{upload_id}", response_model=UploadOut)
def get_upload(upload_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    u, _ = _load_upload(db, upload_id, user)
    return _upload_out(db, u)


@router.get("/photos/{photo_id}")
def get_photo(photo_id: str, thumb: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Photo, photo_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    _load_upload(db, p.upload_id, user)
    data = get_storage().get_bytes(p.storage_key)
    ctype = p.content_type
    if thumb:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
        img.thumbnail((480, 480))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        data, ctype = buf.getvalue(), "image/jpeg"
    return Response(data, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})


@router.get("/projects/{project_id}/reviews", response_model=list[UploadOut])
def pending_reviews(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Uploads that still have proposed claims, oldest first."""
    require(db, project_id, user.id, Perm.progress_approve)
    ids = db.scalars(select(Verification.upload_id).where(Verification.project_id == project_id,
                                                          Verification.state == "proposed").distinct())
    ups = [db.get(Upload, i) for i in ids if i]
    return [_upload_out(db, u) for u in sorted(ups, key=lambda u: u.created_at)]


def _load_ver(db: Session, vid: str, user: User) -> Verification:
    v = db.get(Verification, vid)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    require(db, v.project_id, user.id, Perm.progress_approve)
    return v


@router.post("/verifications/{vid}/approve", response_model=VerificationOut)
def approve_verification(vid: str, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_ver(db, vid, user)
    progress.approve(db, v, user.id, body.reason)
    db.commit()
    return _ver_out(db, [v])[0]


@router.post("/verifications/{vid}/reject", response_model=VerificationOut)
def reject_verification(vid: str, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _load_ver(db, vid, user)
    if len(body.reason.strip()) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give a reason so the worker knows what to fix")
    progress.reject(db, v, user.id, body.reason)
    up = db.get(Upload, v.upload_id) if v.upload_id else None
    if up:
        notify(db, [up.user_id], actor_id=user.id, project_id=v.project_id, kind="progress.rejected",
               title="A progress item was sent back", body=body.reason[:200], link=f"/field/{v.project_id}/zone/{up.zone_id}")
    db.commit()
    return _ver_out(db, [v])[0]


@router.post("/uploads/{upload_id}/approve-all", response_model=UploadOut)
def approve_upload(upload_id: str, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    u = db.get(Upload, upload_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    require(db, u.project_id, user.id, Perm.progress_approve)
    for v in db.scalars(select(Verification).where(Verification.upload_id == u.id, Verification.state == "proposed",
                                                   Verification.verdict == "installed")):
        progress.approve(db, v, user.id, body.reason)
    db.commit()
    return _upload_out(db, u)


@router.post("/elements/{element_id}/status")
def override_status(element_id: str, body: StatusIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Manager override with a reason. 'done' still needs an upload with photos as evidence."""
    el = db.get(Element, element_id)
    if el is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Element not found")
    require(db, el.project_id, user.id, Perm.progress_approve)
    try:
        new = ElementStatus(body.status)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown status") from None
    up = db.get(Upload, body.upload_id) if body.upload_id else None
    if body.upload_id and (up is None or up.project_id != el.project_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown upload")
    v = Verification(project_id=el.project_id, upload_id=body.upload_id, element_id=el.id,
                     verdict="installed" if new == ElementStatus.done else "uncertain", source="manager",
                     state="approved", prev_status=el.status.value, confirmed_by=user.id, overridden=True,
                     override_reason=body.reason, created_by=user.id, reason=body.reason)
    db.add(v)
    db.flush()
    progress.set_status(db, el, new, actor_id=user.id, reason=f"override: {body.reason}", upload_id=body.upload_id,
                        zone_id=up.zone_id if up else None, verification_id=v.id,
                        remove_flags={"possibly_missed", "retake_photo"} if new == ElementStatus.done else set())
    for other in db.scalars(select(Verification).where(Verification.element_id == el.id, Verification.state == "proposed")):
        other.state = "superseded"
    db.commit()
    return {"id": el.id, "status": el.status.value, "flags": el.flags}


@router.get("/elements/{element_id}/evidence", response_model=list[VerificationOut])
def element_evidence(element_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    el = db.get(Element, element_id)
    if el is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Element not found")
    require(db, el.project_id, user.id, Perm.history_view)
    return _ver_out(db, list(db.scalars(select(Verification).where(Verification.element_id == el.id)
                                        .order_by(Verification.created_at.desc()))))


@router.get("/projects/{project_id}/progress")
def progress_summary(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require(db, project_id, user.id, Perm.project_view)
    return progress.summary(db, db.get(Project, project_id))


class OverrideIn(ReviewIn):
    verdict: str


@router.post("/verifications/{vid}/override", response_model=VerificationOut)
def override_verdict(vid: str, body: OverrideIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Disagree with a verdict (usually the AI's), with a reason. The worker who uploaded can propose a
    correction for their manager to approve; a manager's override takes effect immediately (and turning an
    element green still needs this upload's photos)."""
    v = db.get(Verification, vid)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    m = require(db, v.project_id, user.id, Perm.project_view)
    up = db.get(Upload, v.upload_id) if v.upload_id else None
    manager = m.role in (Role.owner, Role.pm)
    if not manager and not (up and up.user_id == user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the uploader or a manager can override this")
    if body.verdict not in ("installed", "missing", "not_visible", "uncertain"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown verdict")
    if len(body.reason.strip()) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A reason is required")
    el = db.get(Element, v.element_id)
    if v.state in ("proposed", "noted"):
        v.state = "superseded"
    new = Verification(project_id=v.project_id, upload_id=v.upload_id, element_id=el.id, verdict=body.verdict,
                       reason=body.reason, source="manager" if manager else "worker", overridden=True,
                       override_reason=body.reason, state="proposed", prev_status=el.status.value, created_by=user.id)
    db.add(new)
    db.flush()
    zone_id = up.zone_id if up else None
    if manager:
        if body.verdict == "installed":
            progress.approve(db, new, user.id, f"override: {body.reason}")
        else:
            new.state, new.confirmed_by = "approved", user.id
            back = ElementStatus(v.prev_status) if v.prev_status and v.prev_status != "done" else el.status
            progress.set_status(db, el, back if el.status == ElementStatus.needs_review else el.status, actor_id=user.id,
                                upload_id=v.upload_id, zone_id=zone_id, verification_id=new.id,
                                add_flags={"possibly_missed"} if body.verdict == "missing" else {"retake_photo"},
                                reason=f"override: {body.reason}")
    elif body.verdict == "installed" and el.status != ElementStatus.done:
        progress.set_status(db, el, ElementStatus.needs_review, actor_id=user.id, upload_id=v.upload_id,
                            zone_id=zone_id, verification_id=new.id, reason=f"worker disputes AI: {body.reason}")
    db.commit()
    return _ver_out(db, [new])[0]
