import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.disciplines import DISCIPLINES
from app.models import (
    Attachment,
    Comment,
    Element,
    ElementRevision,
    Issue,
    IssueStatus,
    Notification,
    Project,
    ProjectMember,
    Role,
    User,
    Zone,
)
from app.rbac import Perm, require, zone_visible
from app.schemas import (
    AttachmentOut,
    CommentIn,
    CommentOut,
    IssueDetail,
    IssueIn,
    IssueOut,
    IssuePatch,
    NotificationOut,
)
from app.services import events
from app.services.issues import issue_visible
from app.services.models import element_visible, visible_disciplines
from app.services.notify import notify
from app.storage import get_storage

router = APIRouter(tags=["issues"])
MAX_ATTACHMENT = 25 * 1024 * 1024
ALLOWED_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf")


def _link(issue: Issue) -> str:
    return f"/p/{issue.project_id}/issues?issue={issue.id}"


def _names(db: Session, ids: set[str | None]) -> dict[str, str]:
    ids = {i for i in ids if i}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}


def _out(db: Session, issues: list[Issue]) -> list[IssueOut]:
    names = _names(db, {i.assignee_id for i in issues} | {i.created_by for i in issues})
    counts = dict(db.execute(select(Comment.issue_id, func.count()).where(
        Comment.issue_id.in_([i.id for i in issues])).group_by(Comment.issue_id)).all()) if issues else {}
    return [IssueOut.model_validate(i).model_copy(update={
        "assignee_name": names.get(i.assignee_id), "creator_name": names.get(i.created_by),
        "comment_count": counts.get(i.id, 0)}) for i in issues]


def _snapshot(i: Issue) -> dict:
    return {k: (v.value if hasattr(v, "value") else v) for k, v in {
        "title": i.title, "status": i.status, "priority": i.priority, "trade": i.trade,
        "assignee_id": i.assignee_id, "due_date": i.due_date, "element_id": i.element_id}.items()}


def _check_member(db: Session, project_id: str, user_id: str | None) -> None:
    if user_id and not db.scalar(select(ProjectMember.id).where(ProjectMember.project_id == project_id,
                                                                ProjectMember.user_id == user_id)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assignee is not on this project")


def _load(db: Session, issue_id: str, user: User, perm: Perm = Perm.project_view) -> tuple[Issue, ProjectMember]:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
    m = require(db, issue.project_id, user.id, perm)
    if not issue_visible(m, issue):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
    return issue, m


@router.get("/projects/{project_id}/issues", response_model=list[IssueOut])
def list_issues(project_id: str, status_: list[IssueStatus] = Query([], alias="status"), trade: str | None = None,
                assignee_id: str | None = None, zone_id: str | None = None, element_id: str | None = None,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.project_view)
    q = select(Issue).where(Issue.project_id == project_id)
    if status_:
        q = q.where(Issue.status.in_(status_))
    if trade:
        q = q.where(Issue.trade == trade)
    if assignee_id:
        q = q.where(Issue.assignee_id == (user.id if assignee_id == "me" else assignee_id))
    if zone_id:
        q = q.where(Issue.zone_id == zone_id)
    if element_id:
        q = q.where(Issue.element_id == element_id)
    issues = [i for i in db.scalars(q.order_by(Issue.number.desc())) if issue_visible(m, i)]
    return _out(db, issues)


@router.post("/projects/{project_id}/issues", response_model=IssueOut, status_code=201)
def create_issue(project_id: str, body: IssueIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = require(db, project_id, user.id, Perm.issue_create)
    project = db.get(Project, project_id)
    zone_id, level_id, trade = body.zone_id, None, body.trade
    if body.element_id:
        el = db.get(Element, body.element_id)
        rev = el and project.current_version_id and db.scalar(select(ElementRevision).where(
            ElementRevision.version_id == project.current_version_id, ElementRevision.element_id == el.id))
        if not rev or el.project_id != project_id or not element_visible(m, rev, visible_disciplines(db, m, DISCIPLINES)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown element")
        zone_id = zone_id or rev.zone_id
        level_id = rev.level_id
        trade = trade or rev.trade
    if zone_id:
        z = db.get(Zone, zone_id)
        if z is None or not zone_visible(m, zone_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown zone")
        level_id = level_id or z.level_id
    if m.role == Role.trade and m.zone_ids is not None and zone_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a zone or element in your area")
    _check_member(db, project_id, body.assignee_id)
    number = (db.scalar(select(func.max(Issue.number)).where(Issue.project_id == project_id)) or 0) + 1
    issue = Issue(project_id=project_id, number=number, title=body.title, description=body.description,
                  priority=body.priority, trade=trade, assignee_id=body.assignee_id, due_date=body.due_date,
                  element_id=body.element_id, zone_id=zone_id, level_id=level_id,
                  anchor=list(body.anchor) if body.anchor else None, sheet_anchor=body.sheet_anchor,
                  viewpoint=body.viewpoint.model_dump() if body.viewpoint else None, created_by=user.id)
    db.add(issue)
    db.flush()
    events.record(db, project_id=project_id, actor_id=user.id, type="issue.created", entity_type="issue",
                  entity_id=issue.id, zone_id=zone_id, data={"number": number, **_snapshot(issue)})
    if issue.element_id:
        events.record(db, project_id=project_id, actor_id=user.id, type="element.issue_opened", entity_type="element",
                      entity_id=issue.element_id, zone_id=zone_id, data={"issue": number, "title": issue.title})
    notify(db, [issue.assignee_id], actor_id=user.id, project_id=project_id, kind="issue.assigned",
           title=f"#{number} assigned to you: {issue.title}", body=f"{project.name}", link=_link(issue))
    db.commit()
    db.refresh(issue)
    return _out(db, [issue])[0]


@router.get("/issues/{issue_id}", response_model=IssueDetail)
def get_issue(issue_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    issue, _ = _load(db, issue_id, user)
    comments = db.scalars(select(Comment).where(Comment.issue_id == issue.id).order_by(Comment.created_at)).all()
    atts = db.scalars(select(Attachment).where(Attachment.owner_type == "issue", Attachment.owner_id == issue.id)
                      .order_by(Attachment.created_at)).all()
    return IssueDetail(**_out(db, [issue])[0].model_dump(),
                       comments=[CommentOut.model_validate(c) for c in comments],
                       attachments=[AttachmentOut.model_validate(a).model_copy(update={"url": f"/api/attachments/{a.id}"})
                                    for a in atts])


@router.patch("/issues/{issue_id}", response_model=IssueOut)
def update_issue(issue_id: str, body: IssuePatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    issue, m = _load(db, issue_id, user, Perm.issue_create)
    changes = body.model_dump(exclude_unset=True)
    manager = m.role in (Role.owner, Role.pm)
    if not manager:
        allowed: set[str] = set()
        if issue.assignee_id == user.id:
            allowed |= {"status"}
        if issue.created_by == user.id:
            allowed |= {"title", "description", "status", "viewpoint", "priority", "due_date"}
        if set(changes) - allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can't change: {sorted(set(changes) - allowed)}")
        if changes.get("status") == IssueStatus.closed and issue.created_by != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a manager or the reporter can close an issue")
    if "assignee_id" in changes:
        _check_member(db, issue.project_id, changes["assignee_id"])
    before = _snapshot(issue)
    old_assignee = issue.assignee_id
    for k, v in changes.items():
        setattr(issue, k, v)
    if "status" in changes:
        issue.closed_at = datetime.now(UTC) if issue.status == IssueStatus.closed else None
    issue.updated_at = datetime.now(UTC)
    after = _snapshot(issue)
    diff = {k: {"from": before[k], "to": after[k]} for k in after if before[k] != after[k]}
    events.record(db, project_id=issue.project_id, actor_id=user.id, type="issue.updated", entity_type="issue",
                  entity_id=issue.id, zone_id=issue.zone_id, data={"number": issue.number, "changes": diff,
                                                                   "title": issue.title})
    if issue.element_id and "status" in diff:
        events.record(db, project_id=issue.project_id, actor_id=user.id, type="element.issue_status",
                      entity_type="element", entity_id=issue.element_id, zone_id=issue.zone_id,
                      data={"issue": issue.number, **diff["status"]})
    if issue.assignee_id != old_assignee:
        notify(db, [issue.assignee_id], actor_id=user.id, project_id=issue.project_id, kind="issue.assigned",
               title=f"#{issue.number} assigned to you: {issue.title}", link=_link(issue))
    if "status" in diff:
        notify(db, [issue.created_by, issue.assignee_id], actor_id=user.id, project_id=issue.project_id,
               kind="issue.status", title=f"#{issue.number} is now {issue.status.value.replace('_', ' ')}",
               body=issue.title, link=_link(issue))
    db.commit()
    db.refresh(issue)
    return _out(db, [issue])[0]


@router.post("/issues/{issue_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(issue_id: str, body: CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    issue, _ = _load(db, issue_id, user, Perm.issue_create)
    c = Comment(issue_id=issue.id, author_id=user.id, body=body.body)
    db.add(c)
    db.flush()
    events.record(db, project_id=issue.project_id, actor_id=user.id, type="issue.commented", entity_type="issue",
                  entity_id=issue.id, zone_id=issue.zone_id, data={"number": issue.number, "comment_id": c.id,
                                                                   "title": issue.title})
    others = set(db.scalars(select(Comment.author_id).where(Comment.issue_id == issue.id)))
    notify(db, {issue.created_by, issue.assignee_id} | others, actor_id=user.id, project_id=issue.project_id,
           kind="issue.comment", title=f"{user.name} commented on #{issue.number}", body=body.body[:200],
           link=_link(issue))
    db.commit()
    db.refresh(c)
    return c


@router.post("/issues/{issue_id}/attachments", response_model=list[AttachmentOut], status_code=201)
async def add_attachments(issue_id: str, files: list[UploadFile] = File(...), user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    issue, _ = _load(db, issue_id, user, Perm.issue_create)
    out = []
    for f in files:
        data = await f.read()
        ctype = f.content_type or "application/octet-stream"
        if ctype not in ALLOWED_TYPES:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"{f.filename}: {ctype} not allowed")
        if len(data) > MAX_ATTACHMENT:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{f.filename} is too large")
        key = get_storage().put_bytes(f"projects/{issue.project_id}/issues/{issue.id}/{uuid.uuid4().hex}", data)
        a = Attachment(project_id=issue.project_id, owner_type="issue", owner_id=issue.id, storage_key=key,
                       filename=(f.filename or "file")[:300], content_type=ctype, size=len(data), uploaded_by=user.id)
        db.add(a)
        db.flush()
        out.append(a)
    events.record(db, project_id=issue.project_id, actor_id=user.id, type="issue.attachments_added",
                  entity_type="issue", entity_id=issue.id, zone_id=issue.zone_id, evidence_ids=[a.id for a in out],
                  data={"number": issue.number, "files": [a.filename for a in out], "title": issue.title})
    db.commit()
    return [AttachmentOut.model_validate(a).model_copy(update={"url": f"/api/attachments/{a.id}"}) for a in out]


@router.get("/attachments/{attachment_id}")
def get_attachment(attachment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(Attachment, attachment_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if a.owner_type == "issue":
        _load(db, a.owner_id, user)
    else:
        require(db, a.project_id, user.id, Perm.project_view)
    return FileResponse(get_storage().local_path(a.storage_key), media_type=a.content_type,
                        headers={"Cache-Control": "private, max-age=86400"})


# ---------------- notifications ----------------

@router.get("/notifications", response_model=list[NotificationOut])
def my_notifications(unread: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread:
        q = q.where(Notification.read_at.is_(None))
    return db.scalars(q.order_by(Notification.created_at.desc()).limit(100)).all()


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(notification_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
               .values(read_at=datetime.now(UTC)))
    db.commit()


@router.post("/notifications/read-all", status_code=204)
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=datetime.now(UTC)))
    db.commit()
