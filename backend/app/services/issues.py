from sqlalchemy.orm import Session


def open_issue_counts(db: Session, project_id: str) -> dict[str, int]:
    """element_id -> number of open issues. Filled in by M2."""
    return {}
