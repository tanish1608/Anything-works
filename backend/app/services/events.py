from sqlalchemy.orm import Session

from app.models import Event


def record(
    db: Session,
    *,
    project_id: str | None,
    actor_id: str | None,
    type: str,
    entity_type: str,
    entity_id: str,
    zone_id: str | None = None,
    data: dict | None = None,
    evidence_ids: list[str] | None = None,
    message: str | None = None,
) -> Event:
    """Add an event to the current transaction. Callers commit it together with the change it describes."""
    ev = Event(
        project_id=project_id,
        actor_id=actor_id,
        type=type,
        entity_type=entity_type,
        entity_id=entity_id,
        zone_id=zone_id,
        data=data or {},
        evidence_ids=evidence_ids or [],
        message=message,
    )
    db.add(ev)
    return ev
