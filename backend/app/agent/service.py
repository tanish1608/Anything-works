import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import jobs
from app.agent import provider
from app.agent.context import authorized_upload, build_context, digest, stamp, validate_current
from app.agent.prompt import CHECK_CODE, POLICY_VERSION, PROMPT_VERSION
from app.agent.schemas import CheckResult, Decision, DecisionCreate, ProposedAction, Run, RunCreate
from app.config import get_settings
from app.models import (
    OPEN_ISSUE_STATUSES,
    AgentAction,
    AgentReference,
    AgentRequest,
    AgentRun,
    DrawingSheet,
    Element,
    Issue,
    Photo,
    Project,
    ProjectMember,
    Role,
    Upload,
    Verification,
    new_id,
)
from app.rbac import Perm, require
from app.services import events, progress
from app.services.notify import notify
from app.services.photos import analysis_copy
from app.storage import get_storage
from app.vision.client import VisionUnavailable

ACTIVE = ("queued", "running", "awaiting_review")


def fail(code: str, message: str, status: int = 409):
    raise HTTPException(status, {"code": code, "message": message})


def load_run(db: Session, run_id: str, actor_id: str) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None:
        fail("not_found", "Assessment not found", 404)
    authorized_upload(db, db.get(Upload, run.upload_id), actor_id)
    return run


def out(db: Session, run: AgentRun) -> Run:
    result = run.result or {}
    actions = list(db.scalars(select(AgentAction).where(AgentAction.run_id == run.id).order_by(AgentAction.id)))
    return Run(id=run.id, project_id=run.project_id, upload_id=run.upload_id, model_version_id=run.model_version_id,
               status=run.status, created_at=stamp(run.created_at), updated_at=stamp(run.updated_at),
               policy_version=run.context["policy_version"], prompt_version=run.context["prompt_version"], model=result.get("model"),
               sources=run.context["sources"], checks=result.get("checks", []),
               actions=[{**a.payload, "status": a.status} for a in actions], error=result.get("error"))


def start(db: Session, project_id: str, actor_id: str, body: RunCreate, key: str, *, contention=0) -> AgentRun:
    require(db, project_id, actor_id, Perm.progress_upload)
    request_hash = digest(body.model_dump())
    claim_id = digest({"project": project_id, "actor": actor_id, "operation": "createAgentRun", "target": body.upload_id, "key": key})
    claim = db.get(AgentRequest, claim_id)
    if claim:
        existing = load_run(db, claim.run_id, actor_id)
        if claim.request_hash != request_hash:
            fail("idempotency_conflict", "Idempotency key was used with a different request")
        return existing
    if not get_settings().agent_enabled:
        fail("invalid_input", "Enable AGENT_ENABLED for the review-only assessment workflow", 422)
    upload = db.get(Upload, body.upload_id)
    if not upload or upload.project_id != project_id:
        fail("not_found", "Update not found", 404)
    if upload.analysis_status not in ("none", "off") and not (upload.analysis or {}).get("agent_run_id"):
        fail("invalid_input", "This update uses the legacy checker; submit a new update in agent mode", 422)
    context = build_context(db, upload, actor_id, body.model_version_id)
    input_hash = digest(context)
    existing = db.scalar(select(AgentRun).where(AgentRun.upload_id == upload.id, AgentRun.input_hash == input_hash))
    if existing:
        db.add(AgentRequest(id=claim_id, run_id=existing.id, request_hash=request_hash))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            if contention >= 2:
                fail("rate_limited", "Assessment submission is busy; retry the same request", 429)
            return start(db, project_id, actor_id, body, key, contention=contention + 1)
        return existing
    run = AgentRun(project_id=project_id, actor_id=actor_id, upload_id=upload.id,
                   model_version_id=body.model_version_id, idempotency_key=key,
                   request_hash=request_hash, input_hash=input_hash, context=context)
    db.add(run)
    try:
        db.flush()
        db.add(AgentRequest(id=claim_id, run_id=run.id, request_hash=request_hash))
        db.flush()
    except IntegrityError:
        db.rollback()
        if contention >= 2:
            fail("rate_limited", "Assessment submission is busy; retry the same request", 429)
        return start(db, project_id, actor_id, body, key, contention=contention + 1)
    jobs.enqueue(db, "agent_assessment", {"run_id": run.id}, project_id, actor_id)
    upload.analysis_status, upload.analysis = "queued", {"agent_run_id": run.id}
    events.record(db, project_id=project_id, actor_id=actor_id, type="agent.queued", entity_type="agent_run",
                  entity_id=run.id, zone_id=upload.zone_id, evidence_ids=[p["id"] for p in context["photos"]],
                  data={"upload_id": upload.id, "model_version_id": run.model_version_id,
                        "prompt_version": PROMPT_VERSION, "policy_version": POLICY_VERSION})
    db.flush()
    return run


def lock_context(db: Session, run: AgentRun, element_ids: list[str]) -> None:
    # These short write locks also fence concurrent model approval/intake and drawing edits.
    db.execute(update(Project).where(Project.id == run.project_id).values(name=Project.name))
    # Cancellation and review acquire the run before proposals, avoiding inverted lock order.
    db.execute(update(AgentRun).execution_options(synchronize_session="fetch").where(AgentRun.id == run.id).values(status=AgentRun.status))
    refs = sorted({s["id"] for s in run.context["sources"] if s["kind"] == "drawing"})
    for ref_id in refs:
        ref = db.get(AgentReference, ref_id)
        if ref is None:
            fail("stale_revision", "Applicable drawing reference is unavailable")
        db.execute(update(DrawingSheet).where(DrawingSheet.id == ref.sheet_id).values(name=DrawingSheet.name))
    for element_id in sorted(element_ids):
        db.execute(update(Element).where(Element.id == element_id).values(status=Element.status))
    # A transaction may have waited behind another writer; cached ORM state is not authoritative.
    db.expire_all()


def cancel(db: Session, run: AgentRun, actor_id: str) -> None:
    member = require(db, run.project_id, actor_id, Perm.project_view)
    if actor_id != run.actor_id and member.role not in (Role.owner, Role.pm):
        fail("not_found", "Assessment not found", 404)
    if run.status == "cancelled":
        return
    n = db.execute(update(AgentRun).execution_options(synchronize_session="fetch").where(AgentRun.id == run.id, AgentRun.status.in_(ACTIVE))
                   .values(status="cancelled", updated_at=datetime.now(UTC), lease_token=None)).rowcount
    if not n:
        fail("superseded", "Assessment is already terminal")
    db.execute(update(AgentAction).where(AgentAction.run_id == run.id, AgentAction.status == "proposed")
               .values(status="superseded"))
    events.record(db, project_id=run.project_id, actor_id=actor_id, type="agent.cancelled", entity_type="agent_run",
                  entity_id=run.id)


def _checks(context: dict, assessment) -> list[CheckResult]:
    got = {}
    elements = {e["id"]: e for e in context["elements"]}
    evidence = {p["id"] for p in context["photos"]}
    if assessment:
        for observation in assessment.observations:
            element = elements.get(observation.element_id)
            if (not element or observation.element_id in got or not set(observation.evidence_ids) <= evidence
                    or not set(observation.source_ids) <= set(element["source_ids"])
                    or len(set(observation.evidence_ids)) != len(observation.evidence_ids)
                    or len(set(observation.source_ids)) != len(observation.source_ids)):
                raise ValueError("Invalid or duplicate assessment identifiers")
            if observation.outcome == "pass" and (not observation.evidence_ids
                                                   or not set(element["source_ids"]) <= set(observation.source_ids)):
                raise ValueError("Passing observation requires evidence and every applicable source")
            got[observation.element_id] = observation
    checks = []
    for element in context["elements"]:
        observation = got.get(element["id"])
        has_drawing = element["drawing_primitive"] is not None
        outcome = observation.outcome if observation and has_drawing else "insufficient_evidence"
        sources = [s for s in context["sources"] if s["id"] in element["source_ids"]
                   and (s["kind"] != "drawing" or s["locator"].endswith(f"/primitive:{element['drawing_primitive']['id']}"))]
        checks.append(CheckResult(
            id=new_id(), check_code=CHECK_CODE, check_version="1", element_ids=[element["id"]], outcome=outcome,
            observation=observation.observation if observation and has_drawing else
            "No applicable approved drawing extraction" if not has_drawing else "No observation returned for this component",
            evidence_ids=observation.evidence_ids if observation and has_drawing else [], sources=sources,
            limitations=["Visible presence only; no installation-quality or inspection certification",
                         "Drawing context is structured extraction, not visual inspection of the original sheet"]
            + (observation.limitations if observation and has_drawing else ["Additional approved context or evidence required"]),
            completion_eligible=False))
    return checks


@jobs.handler("agent_assessment")
def execute(db: Session, job) -> dict:
    run_id, token, now = job.payload["run_id"], new_id(), datetime.now(UTC)
    n = db.execute(update(AgentRun).execution_options(synchronize_session="fetch").where(AgentRun.id == run_id, AgentRun.status == "queued")
                   .values(status="running", attempts=AgentRun.attempts + 1, lease_token=token,
                           lease_until=now + timedelta(seconds=get_settings().agent_timeout_seconds + 15), updated_at=now)).rowcount
    db.commit()
    if not n:
        return {"skipped": True}
    run = db.get(AgentRun, run_id)
    result, status = {}, "awaiting_review"
    try:
        validate_current(db, run)
        context = run.context
        supported = [e for e in context["elements"] if e["drawing_primitive"] is not None]
        assessment = None
        if supported:
            photos = []
            for record in context["photos"]:
                photo = db.get(Photo, record["id"])
                data = get_storage().get_bytes(photo.storage_key)
                if hashlib.sha256(data).hexdigest() != record["sha256"]:
                    raise ValueError("Evidence checksum changed")
                photos.append((photo.id, analysis_copy(data)))
            # Do not hold a database transaction open during provider I/O.
            db.rollback()
            assessment, usage = provider.assess({**context, "elements": supported}, photos)
            result.update(usage)
        checks = _checks(context, assessment)
        result["checks"] = [c.model_dump() for c in checks]
        lock_context(db, run, [e["id"] for e in context["elements"]])
        validate_current(db, db.get(AgentRun, run_id))
    except HTTPException as exc:
        status = "superseded" if exc.status_code == 409 else "failed"
        result = {"error": exc.detail if isinstance(exc.detail, dict) else
                  {"code": "not_found", "message": "Assessment authorization is no longer valid"}}
    except VisionUnavailable:
        status, result = "failed", {"error": {"code": "provider_unavailable", "message": "Live assessment provider is unavailable"}}
    except Exception:
        # Provider exceptions may contain credential URLs or private payloads; persist a public error only.
        status, result = "failed", {"error": {"code": "analysis_failed", "message": "Assessment failed; no progress was completed"}}
    now = datetime.now(UTC)
    n = db.execute(update(AgentRun).execution_options(synchronize_session="fetch").where(AgentRun.id == run_id, AgentRun.status == "running",
                                         AgentRun.lease_token == token, AgentRun.lease_until > now)
                   .values(status=status, result=result, updated_at=now, lease_token=None)).rowcount
    if not n:
        db.rollback()
        return {"discarded": True}
    if status == "awaiting_review":
        for check in checks:
            action = ProposedAction(id=new_id(), kind="record_progress" if check.outcome == "pass" else "request_evidence",
                                    status="proposed", expected_revision=1, fingerprint="0" * 64,
                                    check_ids=[check.id], element_ids=check.element_ids,
                                    description=check.observation, requires_review=True)
            action.fingerprint = digest({"run_id": run_id, "input_hash": run.input_hash,
                                         "action": action.model_dump(exclude={"fingerprint", "status"})})
            db.add(AgentAction(id=action.id, run_id=run_id, payload=action.model_dump()))
    upload = db.get(Upload, run.upload_id)
    upload.analysis_status = "done" if status == "awaiting_review" else "failed"
    upload.analysis = {"agent_run_id": run_id, "prompt_version": PROMPT_VERSION, "policy_version": POLICY_VERSION}
    events.record(db, project_id=run.project_id, actor_id=None, type="agent.assessed", entity_type="agent_run",
                  entity_id=run_id, zone_id=upload.zone_id, data={"status": status, "model": result.get("model")})
    if status == "awaiting_review":
        managers = db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == run.project_id,
                                                                 ProjectMember.role.in_([Role.owner, Role.pm])))
        notify(db, managers, actor_id=None, project_id=run.project_id, kind="agent.review_requested",
               title="Assessment ready for manager review", body=f"Visible component assessment in {context['zone_name']}",
               link=f"/agent?run={run_id}")
    db.commit()
    return {"status": status}


def decide(db: Session, action_id: str, actor_id: str, body: DecisionCreate, key: str) -> Decision:
    action = db.get(AgentAction, action_id)
    if not action:
        fail("not_found", "Proposal not found", 404)
    run = load_run(db, action.run_id, actor_id)
    require(db, run.project_id, actor_id, Perm.progress_approve)
    body_hash = digest(body.model_dump())
    if action.decision:
        old = action.decision
        if old["actor_id"] == actor_id and old["key"] == key and old["body_hash"] == body_hash:
            return Decision.model_validate(old["response"])
        fail("idempotency_conflict", "Proposal already has a decision")
    if run.status != "awaiting_review" or action.status != "proposed":
        fail("superseded", "Proposal is no longer current")
    if body.fingerprint != action.payload["fingerprint"] or body.expected_revision != action.payload["expected_revision"]:
        fail("stale_revision", "Review the current proposal before deciding")
    if not body.reason.strip():
        fail("invalid_input", "A decision reason is required", 422)
    lock_context(db, run, action.payload["element_ids"])
    require(db, run.project_id, actor_id, Perm.progress_approve)
    if action.decision:
        old = action.decision
        if old["actor_id"] == actor_id and old["key"] == key and old["body_hash"] == body_hash:
            return Decision.model_validate(old["response"])
        fail("idempotency_conflict", "Proposal already has a decision")
    if run.status != "awaiting_review" or action.status != "proposed":
        fail("superseded", "Proposal is no longer current")
    validate_current(db, run, element_ids=action.payload["element_ids"])
    new_status = "applied" if body.decision == "accept" else "rejected"
    n = db.execute(update(AgentAction).where(AgentAction.id == action.id, AgentAction.status == "proposed")
                   .values(status=new_status)).rowcount
    if not n:
        fail("superseded", "Another reviewer already decided this proposal")
    upload = db.get(Upload, run.upload_id)
    if body.decision == "accept":
        if action.payload["kind"] == "record_progress":
            issue = db.scalar(select(Issue.id).where(Issue.project_id == run.project_id, Issue.status.in_(OPEN_ISSUE_STATUSES),
                                                     ((Issue.element_id.in_(action.payload["element_ids"]))
                                                      | ((Issue.element_id.is_(None)) & (Issue.zone_id == upload.zone_id))))
                              .limit(1))
            if issue:
                fail("stale_revision", "Resolve the relevant open issue before accepting completion")
            for element_id in action.payload["element_ids"]:
                # A manager's decision is human acceptance, not a fabricated AI/inspection approval.
                ver = Verification(project_id=run.project_id, upload_id=upload.id, element_id=element_id,
                                   source="manager", verdict="installed", state="proposed", reason=body.reason,
                                   created_by=actor_id, prev_status=db.get(Element, element_id).status.value)
                db.add(ver)
                db.flush()
                progress.approve(db, ver, actor_id, body.reason)
        else:
            notify(db, [upload.user_id], actor_id=actor_id, project_id=run.project_id,
                   kind="agent.evidence_requested", title="Additional work evidence requested", body=body.reason,
                   link=f"/agent?run={run.id}")
    response = Decision(id=new_id(), action_id=action.id, actor_id=actor_id, decision=body.decision,
                        reason=body.reason, created_at=datetime.now(UTC),
                        action={**action.payload, "status": new_status})
    action.decision = {"actor_id": actor_id, "key": key, "body_hash": body_hash, "response": response.model_dump(mode="json")}
    action.status = new_status
    events.record(db, project_id=run.project_id, actor_id=actor_id, type="agent.decided", entity_type="agent_action",
                  entity_id=action.id, zone_id=upload.zone_id,
                  data={"decision": body.decision, "reason": body.reason, "run_id": run.id,
                        "fingerprint": body.fingerprint}, evidence_ids=[p["id"] for p in run.context["photos"]])
    db.flush()
    pending = db.scalar(select(AgentAction.id).where(AgentAction.run_id == run.id, AgentAction.status == "proposed").limit(1))
    if pending is None:
        run.status, run.updated_at = "completed", datetime.now(UTC)
    return response


def recover(db: Session) -> None:
    now = datetime.now(UTC)
    expired = list(db.scalars(select(AgentRun).where(AgentRun.status == "running", AgentRun.lease_until <= now)))
    for run in expired:
        state = "queued" if run.attempts < 2 else "failed"
        values = {"status": state, "lease_token": None, "updated_at": now}
        if state == "failed":
            values["result"] = {"error": {"code": "rate_limited", "message": "Assessment retry budget exhausted"}}
        n = db.execute(update(AgentRun).execution_options(synchronize_session="fetch").where(AgentRun.id == run.id, AgentRun.status == "running",
                                              AgentRun.lease_token == run.lease_token, AgentRun.lease_until <= now)
                       .values(**values)).rowcount
        if n and state == "queued":
            jobs.enqueue(db, "agent_assessment", {"run_id": run.id}, run.project_id, run.actor_id)
    db.commit()


jobs.RECOVER.append(recover)
