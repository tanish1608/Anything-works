from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Element, ElementRevision, ElementStatus, ModelVersion, Project, ProjectMember, Role
from app.rbac import trade_visible, zone_visible
from app.services import events


def approve_version(db: Session, version: ModelVersion, actor_id: str, message: str | None = None) -> None:
    if version.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Version is {version.status}, not draft")
    project = db.get(Project, version.project_id)
    if version.branch == "main":
        reset_changed_progress(db, project, version, actor_id)
    version.status = "approved"
    version.approved_by = actor_id
    version.approved_at = datetime.now(UTC)
    if version.branch != "main":  # a proposed design change: approved on its branch, goes live when merged
        events.record(db, project_id=project.id, actor_id=actor_id, type="model.approved", entity_type="model_version",
                      entity_id=version.id, message=message, data={"number": version.number, "branch": version.branch})
        return
    project.current_version_id = version.id
    events.record(db, project_id=project.id, actor_id=actor_id, type="model.approved", entity_type="model_version",
                  entity_id=version.id, message=message, data={"number": version.number})


def reset_changed_progress(db: Session, project: Project, version: ModelVersion, actor_id: str | None) -> None:
    """Progress is kept for unchanged elements. A finished element whose geometry changed can't stay green."""
    prev_hash: dict[str, str | None] = {}
    if project.current_version_id:
        prev_hash = dict(db.execute(select(ElementRevision.element_id, ElementRevision.geom_hash)
                                    .where(ElementRevision.version_id == project.current_version_id)).all())
    # Progress is kept for unchanged elements. A finished element whose geometry changed can't stay green.
    for rev in db.scalars(select(ElementRevision).where(ElementRevision.version_id == version.id)):
        if rev.element_id in prev_hash and prev_hash[rev.element_id] != rev.geom_hash:
            el = db.get(Element, rev.element_id)
            if el.status == ElementStatus.done:
                el.status = ElementStatus.needs_review
                el.flags = sorted(set(el.flags or []) | {"geometry_changed"})
                el.status_updated_at = datetime.now(UTC)
                events.record(db, project_id=project.id, actor_id=actor_id, type="element.status_changed",
                              entity_type="element", entity_id=el.id, zone_id=rev.zone_id,
                              data={"from": "done", "to": "needs_review", "reason": "geometry changed in "
                                    f"model v{version.number}"})


def visible_disciplines(db: Session, member: ProjectMember, all_disciplines: list[str]) -> dict[str, bool]:
    """discipline -> is_context (read-only ghost layer). Missing = not visible."""
    if member.role != Role.trade:
        return {d: False for d in all_disciplines}
    project = db.get(Project, member.project_id)
    ctx = set((project.settings or {}).get("trade_context_disciplines", []))
    out = {}
    from app.disciplines import trade_for

    for d in all_disciplines:
        if trade_for(d) in member.trades or d in member.trades:
            out[d] = False
        elif d in ctx:
            out[d] = True
    return out


def element_visible(member: ProjectMember, rev: ElementRevision, context: dict[str, bool]) -> bool:
    if member.role != Role.trade:
        return True
    if context.get(rev.discipline) is True:
        return True  # context layer: whole layer is visible as a ghost
    if not trade_visible(member, rev.trade) and rev.discipline not in context:
        return False
    if member.zone_ids is None:
        return True
    return rev.zone_id is not None and zone_visible(member, rev.zone_id)


def resolve_version(db: Session, project_id: str, member: ProjectMember, version_id: str | None) -> ModelVersion | None:
    """Drafts are only visible to people who can approve models."""
    if version_id is None:
        project = db.get(Project, project_id)
        return db.get(ModelVersion, project.current_version_id) if project.current_version_id else None
    v = db.get(ModelVersion, version_id)
    if v is None or v.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model version not found")
    if v.status != "approved" and member.role not in (Role.owner, Role.pm):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model version not found")
    return v
