from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.agent import provider
from app.agent.context import digest, stamp
from app.agent.schemas import (
    DailySummary,
    SourceRef,
    Suggestion,
    SuggestionCreate,
    SuggestionResult,
    SummaryRefresh,
    SummaryStatement,
)
from app.models import AgentAction, AgentRun, AgentSummary, Element, ElementRevision, Event, Project, Role, Upload, Zone
from app.rbac import Perm, require


def _scope(member) -> dict:
    return {"role": member.role.value, "trades": sorted(member.trades),
            "zones": None if member.zone_ids is None else sorted(member.zone_ids)}


def suggestion_context(db: Session, project_id: str, actor_id: str, body: SuggestionCreate) -> dict:
    member = require(db, project_id, actor_id, Perm.project_view)
    project = db.get(Project, project_id)
    if project.current_version_id != body.model_version_id:
        raise HTTPException(409, {"code": "stale_revision", "message": "Suggestions require the current approved model"})
    query = select(ElementRevision, Element).join(Element, Element.id == ElementRevision.element_id).where(
        Element.project_id == project_id, ElementRevision.version_id == body.model_version_id)
    if member.role == Role.trade:
        query = query.where(ElementRevision.trade.in_(member.trades))
        if member.zone_ids is not None:
            query = query.where(ElementRevision.zone_id.in_(member.zone_ids))
    if body.element_ids:
        query = query.where(Element.id.in_(body.element_ids))
    rows = db.execute(query.order_by(Element.id).limit(50)).all()
    if body.element_ids and set(body.element_ids) != {e.id for _, e in rows}:
        raise HTTPException(404, {"code": "not_found", "message": "Requested components outside authorized scope"})
    return {"model_version_id": project.current_version_id, "scope": _scope(member),
            "kind": body.kind, "text": body.text,
            "elements": [{"id": e.id, "name": r.name, "class": r.ifc_class,
                          "zone_id": r.zone_id, "trade": r.trade} for r, e in rows]}


def suggestions(db: Session, project_id: str, actor_id: str, body: SuggestionCreate) -> SuggestionResult:
    context = suggestion_context(db, project_id, actor_id, body)
    empty = SuggestionResult(input_revision=body.input_revision, status="unavailable", reason="Suggestions unavailable", suggestions=[])
    if not context["elements"]:
        return empty.model_copy(update={"reason": "No authorized model components available"})
    db.rollback()
    try:
        draft = provider.suggest(context)
        allowed = {e["id"] for e in context["elements"]}
        if any(not s.text.strip() or not s.reason.strip() or not s.element_ids or not set(s.element_ids) <= allowed
               or len(s.element_ids) != len(set(s.element_ids)) for s in draft.suggestions):
            return empty
    except Exception:  # noqa: BLE001 - no raw provider errors or fabricated fallback
        return empty
    db.expire_all()
    if digest(suggestion_context(db, project_id, actor_id, body)) != digest(context):
        raise HTTPException(409, {"code": "stale_revision", "message": "Suggestion context changed; request again"})
    source = SourceRef(kind="model", id=body.model_version_id, revision=body.model_version_id,
                       locator="authorized-components", sha256=digest(context["elements"]))
    items = [Suggestion(text=s.text, reason=s.reason, element_ids=s.element_ids, sources=[source]) for s in draft.suggestions]
    return SuggestionResult(input_revision=body.input_revision, status="available" if items else "unavailable",
                            reason=None if items else "No suggestions for this draft", suggestions=items)


def _window(body: SummaryRefresh):
    try:
        zone = ZoneInfo(body.timezone)
        start = datetime.combine(body.date, time.min, zone).astimezone(UTC)
        end = datetime.combine(body.date + timedelta(days=1), time.min, zone).astimezone(UTC)
    except (ZoneInfoNotFoundError, ValueError, OverflowError):
        raise HTTPException(422, {"code": "invalid_input", "message": "Use a valid date and IANA timezone"}) from None
    return zone, start, end


def summary_context(db: Session, project_id: str, actor_id: str, body: SummaryRefresh) -> tuple[str, str, list[dict], bool]:
    member = require(db, project_id, actor_id, Perm.history_view)
    project = db.get(Project, project_id)
    zone, start, end = _window(body)
    kinds = ["upload.created", "element.status_changed", "agent.decided", "voice.received", "voice.transcribed", "voice.corrected"]
    query = select(Event).where(Event.project_id == project_id, Event.at >= start, Event.at < end, Event.type.in_(kinds))
    if member.role == Role.trade:
        query = query.where(Event.zone_id.is_not(None))
        if member.zone_ids is not None:
            query = query.where(Event.zone_id.in_(member.zone_ids))
        element_trade = select(ElementRevision.id).where(ElementRevision.element_id == Event.entity_id,
            ElementRevision.version_id == project.current_version_id, ElementRevision.trade.in_(member.trades)).exists()
        action_trade = select(AgentAction.id).join(AgentRun, AgentRun.id == AgentAction.run_id).join(Upload, Upload.id == AgentRun.upload_id).where(
            AgentAction.id == Event.entity_id, AgentRun.project_id == project_id, Upload.trade.in_(member.trades)).exists()
        query = query.where(or_(Event.data["trade"].as_string().in_(member.trades),
            (Event.type == "element.status_changed") & element_trade, (Event.type == "agent.decided") & action_trade))
    rows = db.scalars(query.order_by(Event.id.desc()).limit(101)).all()
    facts = []
    for event in rows[:100]:
        location = db.get(Zone, event.zone_id) if event.zone_id else None
        name = location.name if location else "project"
        at = datetime.fromisoformat(stamp(event.at)).astimezone(zone).strftime("%H:%M")
        run_ids = []
        if event.type == "upload.created":
            text = f"{at}: Work update received in {name} ({event.data.get('trade', 'unspecified trade')})."
        elif event.type == "element.status_changed":
            status = event.data.get("to")
            if status not in {"not_started", "in_progress", "needs_review", "done"}:
                continue
            basis = "Human-accepted completion" if status == "done" and event.data.get("completion_basis") == "human" else "Recorded status"
            text = f"{at}: {basis} in {name}: {status.replace('_', ' ')}."
        elif event.type == "agent.decided":
            decision = event.data.get("decision")
            if decision not in {"accept", "reject"}:
                continue
            linked = db.get(AgentRun, event.data.get("run_id"))
            if linked and linked.project_id == project_id:
                run_ids = [linked.id]
            text = f"{at}: Manager recorded an {decision} proposal decision in {name}."
        else:
            text = f"{at}: Voice update {event.type.split('.')[1]} in {name}; a worker statement, not installation proof."
        facts.append({"event_id": event.id, "text": text, "run_ids": run_ids})
    scope = _scope(member)
    identity = digest({"actor": actor_id, "project": project_id, "date": body.date.isoformat(), "timezone": body.timezone, "scope": scope})
    source_hash = digest({"scope": scope, "model": project.current_version_id, "facts": facts,
                          "watermark": [e.id for e in rows]})
    # The briefing considers a named activity subset, not a complete project-history reconstruction.
    return identity, source_hash, facts, True


def _empty(project_id: str, body: SummaryRefresh, reason: str, *, status="unavailable", generated_at=None) -> DailySummary:
    return DailySummary(project_id=project_id, date=body.date, timezone=body.timezone, status=status,
                        generated_at=generated_at, partial_history=True, statements=[], reason=reason)


def read_summary(db: Session, project_id: str, actor_id: str, body: SummaryRefresh) -> DailySummary:
    identity, source_hash, _, _ = summary_context(db, project_id, actor_id, body)
    saved = db.get(AgentSummary, identity)
    if not saved:
        return _empty(project_id, body, "No generated summary for this date and authorized scope; refresh to generate")
    result = DailySummary.model_validate(saved.payload)
    if saved.input_hash != source_hash:
        return _empty(project_id, body, "Saved activity changed; refresh the summary", status="stale", generated_at=result.generated_at)
    return result


def refresh_summary(db: Session, project_id: str, actor_id: str, body: SummaryRefresh) -> DailySummary:
    identity, source_hash, facts, partial = summary_context(db, project_id, actor_id, body)
    result = _empty(project_id, body, "No supported saved activity for this date")
    db.rollback()
    if facts:
        try:
            selection = provider.select_facts({"date": body.date.isoformat(), "timezone": body.timezone, "facts": facts})
            allowed = {f["event_id"]: f for f in facts}
            if not selection.event_ids or len(selection.event_ids) != len(set(selection.event_ids)) or not set(selection.event_ids) <= set(allowed):
                raise ValueError("Unsupported fact selection")
            result = DailySummary(project_id=project_id, date=body.date, timezone=body.timezone,
                status="available", generated_at=datetime.now(UTC), partial_history=partial,
                statements=[SummaryStatement(text=allowed[event_id]["text"], event_ids=[event_id],
                            run_ids=allowed[event_id]["run_ids"]) for event_id in selection.event_ids],
                reason="Briefing covers supported saved activity; times reflect receipt/events, not inferred physical-work dates")
        except Exception:  # noqa: BLE001 - model text cannot invent a fallback summary
            result = _empty(project_id, body, "Summary provider unavailable or returned unsupported citations")
    db.execute(update(Project).where(Project.id == project_id).values(name=Project.name))
    db.expire_all()
    current_id, current_hash, _, _ = summary_context(db, project_id, actor_id, body)
    if (identity, source_hash) != (current_id, current_hash):
        raise HTTPException(409, {"code": "stale_revision", "message": "Summary scope or activity changed; refresh again"})
    db.merge(AgentSummary(id=identity, project_id=project_id, actor_id=actor_id, input_hash=source_hash,
                          payload=result.model_dump(mode="json")))
    db.flush()
    return result
