from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import OPEN_ISSUE_STATUSES, Issue, ProjectMember, Role


def open_issue_counts(db: Session, project_id: str) -> dict[str, int]:
    """element_id -> number of unclosed (including resolved awaiting closure) issues. Drives the red status color."""
    rows = db.execute(select(Issue.element_id, func.count()).where(
        Issue.project_id == project_id, Issue.element_id.is_not(None), Issue.status.in_(OPEN_ISSUE_STATUSES))
        .group_by(Issue.element_id)).all()
    return {eid: n for eid, n in rows}


def issue_visible(member: ProjectMember, issue: Issue) -> bool:
    """Trade members see issues for their trades, assigned to them, or raised by them, within their zones."""
    if member.role != Role.trade:
        return True
    mine = issue.assignee_id == member.user_id or issue.created_by == member.user_id
    if mine:
        return True
    if issue.trade not in member.trades:
        return False
    return member.zone_ids is None or (issue.zone_id is not None and issue.zone_id in member.zone_ids)
