import hashlib
import json
from datetime import UTC

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.agent.prompt import POLICY_VERSION, PROMPT_VERSION
from app.models import AgentReference, DrawingSheet, Event, ModelVersion, Photo, Project, Role, Upload, Zone
from app.rbac import Perm, require, trade_visible, zone_visible
from app.services import progress
from app.storage import get_storage

MAX_ELEMENTS = 40
MAX_PHOTOS = 6
MAX_CONTEXT_BYTES = 100_000
PLAN_GROUPS = ("walls", "rooms", "openings", "fixtures", "devices", "pipes")


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def stamp(value) -> str:
    return (value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)).isoformat()


def freeze_references(db: Session, version: ModelVersion, sheets: list[DrawingSheet]) -> None:
    for sheet in sheets:
        with get_storage().local_path(sheet.storage_key).open("rb") as stream:
            original_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        snapshot = {"plan": sheet.plan, "original_sha256": original_hash,
                    "updated_at": stamp(sheet.updated_at), "discipline": sheet.discipline,
                    "level_id": sheet.level_id}
        db.add(AgentReference(version_id=version.id, sheet_id=sheet.id, sha256=digest(snapshot), snapshot=snapshot))


def authorized_upload(db: Session, upload: Upload, actor_id: str, *, write=False):
    member = require(db, upload.project_id, actor_id, Perm.progress_upload if write else Perm.history_view)
    if not upload.zone_id or not zone_visible(member, upload.zone_id) or not trade_visible(member, upload.trade):
        raise HTTPException(404, {"code": "not_found", "message": "Update outside authorized scope"})
    if write and member.role == Role.trade and upload.user_id != actor_id:
        raise HTTPException(404, {"code": "not_found", "message": "Update outside authorized scope"})
    return member


def build_context(db: Session, upload: Upload, actor_id: str, model_version_id: str) -> dict:
    authorized_upload(db, upload, actor_id, write=True)
    project = db.get(Project, upload.project_id)
    version = db.get(ModelVersion, model_version_id)
    submitted = db.scalar(select(Event).where(Event.project_id == project.id, Event.type == "upload.created",
                                               Event.entity_id == upload.id))
    if (not version or version.project_id != project.id or version.status != "approved"
            or project.current_version_id != version.id or not submitted
            or submitted.data.get("model_version_id") != version.id):
        raise HTTPException(409, {"code": "stale_revision", "message": "Confirm evidence against the active approved model"})
    photos = list(db.scalars(select(Photo).where(Photo.upload_id == upload.id).order_by(Photo.id)))
    if not 1 <= len(photos) <= MAX_PHOTOS or any(p.project_id != project.id for p in photos):
        raise HTTPException(422, {"code": "invalid_input", "message": "An assessment requires one to six scoped photos"})
    claimed = set(submitted.data.get("element_ids") or [])
    rows = progress.current_revisions(db, project, upload.zone_id, upload.trade)
    if claimed:
        rows = [(rev, el) for rev, el in rows if el.id in claimed]
    rows.sort(key=lambda row: row[1].id)
    if not 1 <= len(rows) <= MAX_ELEMENTS:
        raise HTTPException(422, {"code": "invalid_input", "message": "Confirm one to forty components for this update"})
    zone = db.get(Zone, upload.zone_id)
    model_items = [{"id": el.id, "name": rev.name, "ifc_class": rev.ifc_class,
                    "bbox": rev.bbox, "props": rev.props or {}} for rev, el in rows]
    model_source = {"kind": "model", "id": version.id, "revision": str(version.number),
                    "locator": f"zone:{zone.id}", "sha256": digest(model_items)}
    references = {r.sheet_id: r for r in db.scalars(select(AgentReference).where(AgentReference.version_id == version.id))}
    elements, sources = [], [model_source]
    for (rev, el), item in zip(rows, model_items, strict=True):
        props = rev.props or {}
        ref = references.get(props.get("SiteMesh.SheetId"))
        primitive = None
        if ref:
            if digest(ref.snapshot) != ref.sha256:
                raise HTTPException(409, {"code": "stale_revision", "message": "Approved drawing snapshot changed"})
            primitive = next((p for group in PLAN_GROUPS for p in (ref.snapshot["plan"].get(group) or [])
                              if str(p.get("id")) == str(props.get("SiteMesh.PlanId"))), None)
        source_ids = [version.id]
        if primitive:
            sheet = db.get(DrawingSheet, ref.sheet_id)
            if sheet.project_id != project.id or sheet.level_id != zone.level_id:
                raise HTTPException(422, {"code": "invalid_input", "message": "Drawing location does not match the update"})
            if sheet.discipline != "architecture" and sheet.discipline != rev.discipline:
                raise HTTPException(422, {"code": "invalid_input", "message": "Drawing discipline does not match the component"})
            source = {"kind": "drawing", "id": ref.id, "revision": ref.sha256,
                      "locator": f"sheet:{sheet.id}/primitive:{primitive['id']}", "sha256": ref.sha256}
            if source not in sources:
                sources.append(source)
            source_ids.append(ref.id)
        elements.append({**item, "source_ids": source_ids, "drawing_primitive": primitive,
                         "expected_status_time": stamp(el.status_updated_at) if el.status_updated_at else None})
    history = list(db.scalars(select(Event).where(Event.project_id == project.id,
                                                  Event.entity_id.in_([el.id for _, el in rows]),
                                                  Event.type == "element.status_changed")
                              .order_by(Event.at.desc(), Event.id).limit(12)))
    context = {"project_id": project.id, "upload_id": upload.id, "model_version_id": version.id,
               "zone_id": zone.id, "zone_name": zone.name, "trade": upload.trade, "note": upload.note[:5000],
               "policy_version": POLICY_VERSION, "prompt_version": PROMPT_VERSION,
               "sources": sources, "elements": elements,
               "photos": [{"id": p.id, "sha256": p.sha256} for p in photos],
               "history": [{"event_id": e.id, "element_id": e.entity_id, "at": e.at.isoformat(),
                            "from": e.data.get("from"), "to": e.data.get("to")} for e in history]}
    if len(json.dumps(context).encode()) > MAX_CONTEXT_BYTES:
        raise HTTPException(422, {"code": "invalid_input", "message": "Select a smaller assessment scope"})
    return context


def validate_current(db: Session, run, *, element_ids: list[str] | None = None) -> None:
    if run.context["policy_version"] != POLICY_VERSION or run.context["prompt_version"] != PROMPT_VERSION:
        raise HTTPException(409, {"code": "stale_revision", "message": "Assessment policy changed; submit fresh evidence"})
    upload = db.get(Upload, run.upload_id)
    authorized_upload(db, upload, run.actor_id, write=True)
    if db.get(Project, run.project_id).current_version_id != run.model_version_id:
        raise HTTPException(409, {"code": "stale_revision", "message": "Approved model changed"})
    targets = set(element_ids if element_ids is not None else [e["id"] for e in run.context["elements"]])
    newer = db.scalars(select(Event.data).select_from(Upload).outerjoin(
        Event, and_(Event.project_id == Upload.project_id, Event.entity_id == Upload.id, Event.type == "upload.created")
    ).where(Upload.project_id == run.project_id, Upload.zone_id == upload.zone_id,
            Upload.trade == upload.trade, Upload.created_at > upload.created_at))
    for submitted in newer:
        # An unscoped update covers the zone/trade; explicit disjoint claims remain independent.
        claimed = set((submitted or {}).get("element_ids") or [])
        if not claimed or targets.intersection(claimed):
            raise HTTPException(409, {"code": "superseded", "message": "Newer evidence is available for this work"})
    for source in run.context["sources"]:
        if source["kind"] != "drawing":
            continue
        ref = db.get(AgentReference, source["id"])
        sheet = db.get(DrawingSheet, ref.sheet_id) if ref else None
        if not sheet or digest(ref.snapshot) != source["sha256"] or ref.sha256 != source["revision"]:
            raise HTTPException(409, {"code": "stale_revision", "message": "Approved drawing reference changed"})
        if digest(sheet.plan) != digest(ref.snapshot["plan"]) or stamp(sheet.updated_at) != ref.snapshot["updated_at"]:
            raise HTTPException(409, {"code": "stale_revision", "message": "Applicable drawing changed"})
        try:
            with get_storage().local_path(sheet.storage_key).open("rb") as stream:
                original_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        except OSError:
            raise HTTPException(409, {"code": "stale_revision", "message": "Drawing asset unavailable"}) from None
        if original_hash != ref.snapshot["original_sha256"]:
            raise HTTPException(409, {"code": "stale_revision", "message": "Drawing asset changed"})
    fresh = build_context(db, upload, run.actor_id, run.model_version_id)
    if digest(fresh["photos"]) != digest(run.context["photos"]) or fresh["note"] != run.context["note"]:
        raise HTTPException(409, {"code": "stale_revision", "message": "Submission evidence changed"})
    for record in run.context["photos"]:
        photo = db.get(Photo, record["id"])
        try:
            with get_storage().local_path(photo.storage_key).open("rb") as stream:
                original_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        except OSError:
            raise HTTPException(409, {"code": "stale_revision", "message": "Original evidence unavailable"}) from None
        if original_hash != record["sha256"]:
            raise HTTPException(409, {"code": "stale_revision", "message": "Original evidence changed"})
    old = {e["id"]: e for e in run.context["elements"]}
    current = {e["id"]: e for e in fresh["elements"]}
    if any(e not in current or digest(current[e]) != digest(old[e]) for e in targets):
        raise HTTPException(409, {"code": "stale_revision", "message": "Component state or context changed"})
