from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.agent import provider
from app.agent.context import digest, stamp
from app.agent.schemas import ChatCreate, ChatResult, SourceRef
from app.models import Element, ElementRevision, Issue, Project, Role
from app.rbac import Perm, require


def snapshot(db: Session, project_id: str, actor_id: str):
    member = require(db, project_id, actor_id, Perm.project_view)
    project = db.get(Project, project_id)
    components = select(ElementRevision, Element).join(Element, Element.id == ElementRevision.element_id).where(
        Element.project_id == project_id, ElementRevision.version_id == project.current_version_id)
    issues = select(Issue).where(Issue.project_id == project_id)
    if member.role == Role.trade:
        components = components.where(ElementRevision.trade.in_(member.trades))
        visible = Issue.trade.in_(member.trades)
        if member.zone_ids is not None:
            components = components.where(ElementRevision.zone_id.in_(member.zone_ids))
            visible = and_(visible, Issue.zone_id.in_(member.zone_ids))
        issues = issues.where(or_(Issue.created_by == actor_id, Issue.assignee_id == actor_id, visible))
    facts, refs = [], {}
    for revision, element in db.execute(components.order_by(Element.id).limit(25)):
        key = f"component:{element.id}"
        fact = {"source_id": key, "name": revision.name, "class": revision.ifc_class, "trade": revision.trade,
                "zone_id": revision.zone_id, "recorded_status": element.status.value,
                "status_updated_at": stamp(element.status_updated_at) if element.status_updated_at else None}
        facts.append(fact)
        refs[key] = SourceRef(kind="model", id=project.current_version_id, revision=project.current_version_id,
                              locator=key, sha256=digest(fact))
    for issue in db.scalars(issues.order_by(Issue.updated_at.desc(), Issue.id).limit(20)):
        key = f"issue:{issue.id}"
        fact = {"source_id": key, "title": issue.title, "description": issue.description[:1000],
                "recorded_status": issue.status.value, "trade": issue.trade, "zone_id": issue.zone_id,
                "assignee_id": issue.assignee_id, "updated_at": stamp(issue.updated_at)}
        facts.append(fact)
        refs[key] = SourceRef(kind="issue", id=issue.id, revision=stamp(issue.updated_at), locator=key, sha256=digest(fact))
    context = {"project_name": project.name, "model_version_id": project.current_version_id,
               "scope": {"role": member.role.value, "trades": sorted(member.trades),
                         "zones": None if member.zone_ids is None else sorted(member.zone_ids)},
               "partial_coverage": "At most 25 authorized components and 20 visible issue snapshots; not full project history.",
               "server_facts": facts}
    return context, refs


def answer(db: Session, project_id: str, actor_id: str, body: ChatCreate) -> ChatResult:
    if not body.message.strip():
        raise HTTPException(422, {"code": "invalid_input", "message": "Enter a question"})
    context, refs = snapshot(db, project_id, actor_id)
    unavailable = ChatResult(input_revision=body.input_revision, status="unavailable",
        message="Agent Isle could not answer. Check provider access or try again; no project records were changed.",
        sources=[], suggested_questions=[], partial_context=True)
    db.rollback()
    try:
        draft = provider.chat({**context, "question": body.message, "page": body.page,
                               "untrusted_local_sample_context": body.display_context,
                               "untrusted_session_history": [turn.model_dump() for turn in body.history]})
        if (not draft.message.strip() or len(draft.source_ids) != len(set(draft.source_ids))
                or not set(draft.source_ids) <= refs.keys()
                or any(not q.strip() or len(q) > 200 for q in draft.suggested_questions)):
            return unavailable
        if context["server_facts"] and not draft.source_ids:
            return unavailable
    except Exception:  # noqa: BLE001 - expose no raw provider error or fabricated answer
        return unavailable
    db.expire_all()
    current, _ = snapshot(db, project_id, actor_id)
    if digest(current) != digest(context):
        raise HTTPException(409, {"code": "stale_revision", "message": "Project context changed; ask again"})
    return ChatResult(input_revision=body.input_revision, status="available", message=draft.message,
                      sources=[refs[key] for key in draft.source_ids], suggested_questions=draft.suggested_questions,
                      partial_context=True)


def public_answer(body: ChatCreate) -> ChatResult:
    """Answer from the visible local canvas only; no authenticated project facts are available."""
    unavailable = ChatResult(input_revision=body.input_revision, status="unavailable",
        message="Agent Isle could not answer from this local context. Connect project records or try again.",
        sources=[], suggested_questions=[], partial_context=True)
    try:
        draft = provider.chat({
            "mode": "local_sample_only",
            "partial_coverage": "The browser supplied a local sample snapshot; there are no authenticated project facts.",
            "local_display_context": body.display_context,
            "question": body.message,
            "page": body.page,
            "untrusted_session_history": [turn.model_dump() for turn in body.history],
        })
        if (not draft.message.strip() or draft.source_ids or
                any(not q.strip() or len(q) > 200 for q in draft.suggested_questions)):
            return unavailable
    except Exception:  # noqa: BLE001 - never expose provider details or invent a local answer
        return unavailable
    return ChatResult(input_revision=body.input_revision, status="available", message=draft.message,
                      sources=[], suggested_questions=draft.suggested_questions, partial_context=True)
