"""Git-like history: version diffs, timeline replay data and branch merges."""

import math
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Element, ElementRevision, Event, Issue, ModelVersion, Project
from app.services import events

MOVE_TOL = 0.02  # metres


def _center(b):
    return ((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2) if b else None


def diff_versions(db: Session, a: ModelVersion, b: ModelVersion) -> dict:
    ra = {r.element_id: r for r in db.scalars(select(ElementRevision).where(ElementRevision.version_id == a.id))}
    rb = {r.element_id: r for r in db.scalars(select(ElementRevision).where(ElementRevision.version_id == b.id))}

    def row(r: ElementRevision, **extra):
        return {"element_id": r.element_id, "name": r.name, "ifc_class": r.ifc_class, "discipline": r.discipline,
                "level_id": r.level_id, "zone_id": r.zone_id, **extra}

    added = [row(rb[e]) for e in rb.keys() - ra.keys()]
    removed = [row(ra[e]) for e in ra.keys() - rb.keys()]
    moved, changed = [], []
    for e in ra.keys() & rb.keys():
        x, y = ra[e], rb[e]
        ca, cb = _center(x.bbox), _center(y.bbox)
        dist = math.dist(ca, cb) if ca and cb else 0.0
        fields = [f for f in ("ifc_class", "name", "discipline", "zone_id", "level_id") if getattr(x, f) != getattr(y, f)]
        if dist > MOVE_TOL:
            moved.append(row(y, distance_m=round(dist, 3), changed_fields=fields))
        elif x.geom_hash != y.geom_hash or fields:
            changed.append(row(y, changed_fields=fields + (["geometry"] if x.geom_hash != y.geom_hash else [])))
    key = lambda r: (r["discipline"], r["ifc_class"], r["name"] or "")  # noqa: E731
    return {"from": {"id": a.id, "number": a.number}, "to": {"id": b.id, "number": b.number},
            "added": sorted(added, key=key), "removed": sorted(removed, key=key), "moved": sorted(moved, key=key),
            "changed": sorted(changed, key=key), "unchanged": len(ra.keys() & rb.keys()) - len(moved) - len(changed)}


def timeline(db: Session, project: Project, visible_ids: set[str] | None) -> dict:
    """Everything needed to replay status colours at any moment: status changes and issue lifetimes."""
    rows = db.execute(select(Event.at, Event.entity_id, Event.data, Event.actor_id)
                      .where(Event.project_id == project.id, Event.type == "element.status_changed")
                      .order_by(Event.id)).all()
    changes = [{"at": at.isoformat(), "element_id": eid, "status": d.get("to"), "flags": d.get("flags", []),
                "completion_basis": d.get("completion_basis")}
               for at, eid, d, _ in rows if visible_ids is None or eid in visible_ids]
    issues = [{"element_id": i.element_id, "opened_at": i.created_at.isoformat(),
               "closed_at": i.closed_at.isoformat() if i.closed_at else (
                   i.updated_at.isoformat() if i.status.value == "resolved" else None)}
              for i in db.scalars(select(Issue).where(Issue.project_id == project.id, Issue.element_id.is_not(None)))
              if visible_ids is None or i.element_id in visible_ids]
    start = db.scalar(select(func.min(Event.at)).where(Event.project_id == project.id)) or project.created_at
    versions = [{"id": v.id, "number": v.number, "at": (v.approved_at or v.created_at).isoformat(), "message": v.message}
                for v in db.scalars(select(ModelVersion).where(ModelVersion.project_id == project.id,
                                                               ModelVersion.status == "approved").order_by(ModelVersion.number))]
    return {"start": start.isoformat(), "end": datetime.now(UTC).isoformat(), "status_changes": changes,
            "issues": issues, "versions": versions}


def merge_branch(db: Session, version: ModelVersion, actor_id: str, message: str | None) -> ModelVersion:
    """Merge an approved version from a side branch into main: a new main version with both parents.
    (Proposed design changes live on a branch until approved and merged.) Content = the branch version."""
    if version.branch == "main":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already on main")
    if version.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Approve the branch version before merging")
    project = db.get(Project, version.project_id)
    number = (db.scalar(select(func.max(ModelVersion.number)).where(ModelVersion.project_id == project.id)) or 0) + 1
    merged = ModelVersion(project_id=project.id, number=number, parent_id=project.current_version_id,
                          merge_parent_id=version.id, branch="main", message=message or f"Merge branch '{version.branch}'",
                          source="merge", status="approved", author_id=actor_id, approved_by=actor_id,
                          approved_at=datetime.now(UTC), files=version.files, stats=version.stats)
    db.add(merged)
    db.flush()
    for r in db.scalars(select(ElementRevision).where(ElementRevision.version_id == version.id)):
        db.add(ElementRevision(version_id=merged.id, element_id=r.element_id, name=r.name, ifc_class=r.ifc_class,
                               discipline=r.discipline, trade=r.trade, level_id=r.level_id, zone_id=r.zone_id, bbox=r.bbox,
                               props=r.props, source=r.source, confidence=r.confidence, geom_hash=r.geom_hash))
    from app.services.models import reset_changed_progress

    reset_changed_progress(db, project, merged, actor_id)
    project.current_version_id = merged.id
    events.record(db, project_id=project.id, actor_id=actor_id, type="model.merged", entity_type="model_version",
                  entity_id=merged.id, message=merged.message,
                  data={"number": number, "from_branch": version.branch, "merged_version": version.number})
    return merged


def element_ids_in(db: Session, version_id: str) -> set[str]:
    return set(db.scalars(select(Element.id).join(ElementRevision, ElementRevision.element_id == Element.id)
                          .where(ElementRevision.version_id == version_id)))
