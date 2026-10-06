"""Progress tracking rules. The non-negotiable lives here: an element can only become `done` through a
Verification that links to an Upload with at least one Photo."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.disciplines import DISCIPLINES
from app.models import (
    Element,
    ElementRevision,
    ElementStatus,
    Event,
    Photo,
    Project,
    ProjectMember,
    Role,
    Upload,
    Verification,
    WorkPackage,
)
from app.rbac import zone_visible
from app.services import events
from app.services.models import element_visible, visible_disciplines

CLEAR_ON_CLAIM = {"possibly_missed", "retake_photo"}


class EvidenceRequired(HTTPException):
    def __init__(self):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY,
                         "An element can only be marked done with linked photo evidence (an upload with photos).")


def photo_ids(db: Session, upload_id: str | None) -> list[str]:
    if not upload_id:
        return []
    return list(db.scalars(select(Photo.id).where(Photo.upload_id == upload_id)))


def set_status(db: Session, el: Element, new: ElementStatus, *, actor_id: str | None, reason: str,
               upload_id: str | None, zone_id: str | None, add_flags: set[str] = frozenset(),
               remove_flags: set[str] = frozenset(), verification_id: str | None = None) -> None:
    if db.scalar(select(WorkPackage.id).where(WorkPackage.element_id == el.id)):
        raise HTTPException(409, "Review this component through its assigned shared work record")
    evidence = photo_ids(db, upload_id)
    verification = db.get(Verification, verification_id) if verification_id else None
    basis = ("legacy_ai" if verification.source == "ai" else "human") if verification and new == ElementStatus.done else None
    if new == ElementStatus.done and not evidence:
        raise EvidenceRequired()
    old = el.status
    flags = (set(el.flags or []) - set(remove_flags)) | set(add_flags)
    if new == ElementStatus.done:
        flags -= {"possibly_missed", "retake_photo", "geometry_changed"}
    if old == new and flags == set(el.flags or []):
        return
    el.status = new
    el.flags = sorted(flags)
    el.status_updated_at = datetime.now(UTC)
    events.record(db, project_id=el.project_id, actor_id=actor_id, type="element.status_changed", entity_type="element",
                  entity_id=el.id, zone_id=zone_id, evidence_ids=([upload_id] if upload_id else []) + evidence,
                  data={"from": old.value, "to": new.value, "reason": reason, "flags": el.flags,
                        "verification_id": verification_id, "completion_basis": basis})


def current_revisions(db: Session, project: Project, zone_id: str, trade: str | None = None) -> list[tuple[ElementRevision, Element]]:
    if not project.current_version_id:
        return []
    q = (select(ElementRevision, Element).join(Element, Element.id == ElementRevision.element_id)
         .where(ElementRevision.version_id == project.current_version_id, ElementRevision.zone_id == zone_id))
    if trade:
        q = q.where(ElementRevision.trade == trade)
    return list(db.execute(q).all())


def checklist(db: Session, project: Project, member: ProjectMember, zone_id: str, trade: str | None) -> list[dict]:
    if not zone_visible(member, zone_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zone not found")
    if member.role == Role.trade:
        if trade and trade not in member.trades:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your trade")
        trades = [trade] if trade else member.trades
    else:
        trades = [trade] if trade else None
    vis = visible_disciplines(db, member, DISCIPLINES)
    rows = []
    for rev, el in current_revisions(db, project, zone_id):
        if trades is not None and rev.trade not in trades:
            continue
        if rev.discipline in ("architecture",) and (trades is None or "architecture" not in trades):
            continue  # walls/doors aren't on a trade's install checklist unless they're that trade
        if not element_visible(member, rev, vis):
            continue
        last = db.scalar(select(Verification).where(Verification.element_id == el.id)
                         .order_by(Verification.created_at.desc()).limit(1))
        rows.append({"id": el.id, "name": rev.name, "ifc_class": rev.ifc_class, "trade": rev.trade,
                     "discipline": rev.discipline, "status": el.status.value, "flags": el.flags or [],
                     "bbox": rev.bbox, "props": {k: v for k, v in (rev.props or {}).items() if k.startswith("SiteMesh.")},
                     "last_verification": None if last is None else {
                         "id": last.id, "verdict": last.verdict, "state": last.state, "source": last.source,
                         "confidence": last.confidence, "reason": last.reason, "upload_id": last.upload_id}})
    rows.sort(key=lambda r: (r["ifc_class"], r["name"] or ""))
    return rows


def claim(db: Session, upload: Upload, element_ids: list[str], actor_id: str, *, source: str = "worker",
          verdict: str = "installed", confidence: float | None = None, reason: str = "",
          model: str | None = None, prompt_version: str | None = None) -> list[Verification]:
    out = []
    for eid in element_ids:
        el = db.get(Element, eid)
        prev = el.status.value
        # older proposals for this element are superseded by the newer evidence
        for v in db.scalars(select(Verification).where(Verification.element_id == eid, Verification.state == "proposed",
                                                       Verification.source == source)):
            v.state = "superseded"
        v = Verification(project_id=upload.project_id, upload_id=upload.id, element_id=eid, verdict=verdict,
                         confidence=confidence, reason=reason, source=source, model=model, prompt_version=prompt_version,
                         state="proposed", prev_status=prev, created_by=actor_id)
        db.add(v)
        db.flush()
        if source == "worker" or el.status != ElementStatus.done:
            set_status(db, el, ElementStatus.needs_review, actor_id=actor_id, upload_id=upload.id, zone_id=upload.zone_id,
                       reason=f"{source} reported installed", remove_flags=CLEAR_ON_CLAIM, verification_id=v.id)
        out.append(v)
    return out


def approve(db: Session, v: Verification, actor_id: str, note: str = "") -> None:
    if v.state != "proposed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {v.state}")
    el = db.get(Element, v.element_id)
    upload = db.get(Upload, v.upload_id) if v.upload_id else None
    if upload:
        submitted = db.scalar(select(Event).where(Event.entity_id == upload.id, Event.type == "upload.created",
                                                  Event.project_id == upload.project_id))
        baseline = (submitted.data or {}).get("model_version_id") if submitted else None
        project = db.get(Project, upload.project_id)
        if baseline and baseline != project.current_version_id:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "This evidence belongs to a previous model revision. Review a new update against the active baseline.")
    set_status(db, el, ElementStatus.done, actor_id=actor_id, upload_id=v.upload_id,
               zone_id=upload.zone_id if upload else None, reason=note or f"approved {v.source} claim",
               verification_id=v.id)
    v.state, v.confirmed_by, v.confirmed_at = "approved", actor_id, datetime.now(UTC)
    for other in db.scalars(select(Verification).where(Verification.element_id == el.id, Verification.state == "proposed",
                                                       Verification.id != v.id)):
        other.state = "superseded"


def reject(db: Session, v: Verification, actor_id: str, reason: str) -> None:
    if v.state != "proposed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {v.state}")
    el = db.get(Element, v.element_id)
    upload = db.get(Upload, v.upload_id) if v.upload_id else None
    v.state, v.confirmed_by, v.confirmed_at, v.override_reason = "rejected", actor_id, datetime.now(UTC), reason
    if el.status == ElementStatus.needs_review:
        back = ElementStatus(v.prev_status) if v.prev_status and v.prev_status != "done" else ElementStatus.not_started
        set_status(db, el, back, actor_id=actor_id, upload_id=None, zone_id=upload.zone_id if upload else None,
                   reason=f"claim rejected: {reason}", add_flags={"retake_photo"}, verification_id=v.id)


def summary(db: Session, project: Project) -> dict:
    """Counts by zone × trade × status for the current model."""
    if not project.current_version_id:
        return {"zones": {}, "totals": {}}
    rows = db.execute(select(ElementRevision.zone_id, ElementRevision.trade, Element.status, func.count())
                      .join(Element, Element.id == ElementRevision.element_id)
                      .where(ElementRevision.version_id == project.current_version_id,
                             ElementRevision.discipline != "architecture")
                      .group_by(ElementRevision.zone_id, ElementRevision.trade, Element.status)).all()
    zones: dict = {}
    totals: dict = {}
    for zone_id, trade, st, n in rows:
        z = zones.setdefault(zone_id or "none", {}).setdefault(trade, {})
        z[st.value] = n
        totals[st.value] = totals.get(st.value, 0) + n
    return {"zones": zones, "totals": totals}
