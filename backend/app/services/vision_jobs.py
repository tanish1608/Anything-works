"""AI photo analysis hook (M5). M4 only defines the no-op so uploads work without it."""

from sqlalchemy.orm import Session

from app.models import Upload


def maybe_enqueue_analysis(db: Session, upload: Upload) -> None:
    return None
