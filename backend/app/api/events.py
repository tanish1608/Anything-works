from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Event, Role, User, WorkPackage
from app.rbac import Perm, require
from app.schemas import EventOut

router = APIRouter(tags=["history"])


@router.get("/projects/{project_id}/events", response_model=list[EventOut])
def list_events(
    project_id: str,
    before_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    zone_id: str | None = None,
    entity_id: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Newest first. Page with ?before_id=<last id seen>. Trade members only see events tied to zones
    in their scope (project admin events such as membership changes are hidden from them)."""
    member = require(db, project_id, user.id, Perm.history_view)
    q = select(Event, User.name).outerjoin(User, User.id == Event.actor_id).where(Event.project_id == project_id)
    if member.role == Role.trade:
        q = q.where(Event.zone_id.is_not(None))
        if member.zone_ids is not None:
            q = q.where(Event.zone_id.in_(member.zone_ids))
    if member.role == Role.trade:
        from app.services.workflow import visible
        ids = [w.id for w in db.scalars(select(WorkPackage).where(WorkPackage.project_id == project_id)) if visible(member, w)]
        q = q.where(or_(Event.entity_type != "work", Event.entity_id.in_(ids)))
        q = q.where(or_(Event.data["work_id"].as_string().is_(None), Event.data["work_id"].as_string().in_(ids)))
    if before_id is not None:
        q = q.where(Event.id < before_id)
    if zone_id is not None:
        q = q.where(Event.zone_id == zone_id)
    if entity_id is not None:
        q = q.where(Event.entity_id == entity_id)
    rows = db.execute(q.order_by(Event.id.desc()).limit(limit)).all()
    return [EventOut.model_validate(e).model_copy(update={"actor_name": name}) for e, name in rows]
