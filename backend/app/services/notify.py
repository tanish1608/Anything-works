"""In-app notifications. A push channel (web push / FCM) can subscribe to the same calls later."""

from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import Notification


def notify(db: Session, user_ids: Iterable[str | None], *, actor_id: str | None, project_id: str | None, kind: str,
           title: str, body: str = "", link: str | None = None) -> int:
    """Notify each user once, never the person who caused it."""
    n = 0
    for uid in {u for u in user_ids if u and u != actor_id}:
        db.add(Notification(user_id=uid, project_id=project_id, kind=kind, title=title, body=body, link=link))
        n += 1
    return n
