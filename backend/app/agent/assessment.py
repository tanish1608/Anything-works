"""Review-only AI check of a received work update against its approved model reference.

Flow: a crew update is received -> a check run is queued with a frozen context (work, location, approved
component, worker note/claim, open issue for corrections, photo checksums) -> the job asks the model for one
observation per component -> the server validates every identifier and citation -> the result is shown to the
PM as a suggestion. Nothing here changes work status, completion or issues; the PM's decision does that.
"""
import hashlib
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.agent import provider
from app.agent.prompt import CHECK_CODE, CHECK_VERSION, POLICY_VERSION, PROMPT_VERSION
from app.agent.schemas import Assessment, CheckResult
from app.config import get_settings
from app.models import (
    OPEN_ISSUE_STATUSES,
    ElementRevision,
    Issue,
    ModelVersion,
    Photo,
    ProjectMember,
    Role,
    Upload,
    WorkAssessment,
    WorkPackage,
    WorkSubmission,
)
from app.services import events
from app.services.notify import notify
from app.services.photos import analysis_copy
from app.storage import get_storage
from app.vision import client as vision

log = logging.getLogger(__name__)
PROP_HINTS = ("name", "type", "size", "material", "system", "mark", "family", "description", "width", "height")


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def enabled() -> bool:
    return get_settings().agent_enabled and vision.mode() == "gemini"


def _props(props: dict) -> dict:
    """A small, readable subset of source properties; long or nested values are not useful to the model."""
    out = {}
    for key, value in sorted((props or {}).items()):
        short = key.split(".")[-1]
        if isinstance(value, (str, int, float)) and str(value).strip() and any(h in short.lower() for h in PROP_HINTS):
            out[short] = str(value)[:120]
        if len(out) >= 20:
            break
    return out


def build_context(db: Session, work: WorkPackage, upload: Upload, receipt: WorkSubmission) -> dict:
    ref = receipt.reference
    version_id = ref["location"]["version"]
    version = db.get(ModelVersion, version_id)
    elements, sources = [], []
    for element_id in ref["location"]["elements"]:
        rev = db.scalar(select(ElementRevision).where(ElementRevision.version_id == version_id,
                                                      ElementRevision.element_id == element_id))
        if rev is None:
            continue
        b = rev.bbox or [0] * 6
        item = {"id": element_id, "name": rev.name, "ifc_class": rev.ifc_class, "discipline": rev.discipline,
                "properties": _props(rev.props), "size_m": [round(abs(b[i + 3] - b[i]), 3) for i in range(3)]}
        elements.append(item)
        sources.append({"kind": "model", "id": version_id, "revision": str(version.number if version else ""),
                        "locator": f"element:{element_id}", "sha256": digest(item)})
    issue = db.get(Issue, work.issue_id) if work.issue_id else None
    open_issue = issue if issue and issue.status in OPEN_ISSUE_STATUSES else None
    photos = list(db.scalars(select(Photo).where(Photo.upload_id == upload.id).order_by(Photo.id)))
    loc = ref["location"]
    return {
        "work": {"id": work.id, "title": work.state["title"], "trade": work.state["trade"], "scope": ref["scope"],
                 "capture_guidance": ref.get("captureGuidance") or ""},
        "location": {k: loc.get(k) for k in ("building", "levelName", "roomName", "spaceCode")},
        "reference": ref["reference"],
        "correction_of_issue": {"title": open_issue.title, "problem": open_issue.description[:2000]} if open_issue else None,
        "worker_note": upload.note[:2000], "worker_claim": receipt.claim,
        "elements": elements, "sources": sources,
        "photos": [{"id": p.id, "sha256": p.sha256} for p in photos],
        "prompt_version": PROMPT_VERSION, "policy_version": POLICY_VERSION, "model_version_id": version_id,
    }


def maybe_enqueue(db: Session, work: WorkPackage, upload: Upload, receipt: WorkSubmission) -> WorkAssessment | None:
    """Queue a check for a just-received update (same transaction). No-op unless AGENT_ENABLED with Gemini."""
    if not enabled():
        return None
    context = build_context(db, work, upload, receipt)
    if not context["elements"] or not context["photos"]:
        return None
    run = WorkAssessment(project_id=work.project_id, work_id=work.id, upload_id=upload.id,
                         input_hash=digest(context), context=context, result={}, status="queued")
    db.add(run)
    db.flush()
    jobs.enqueue(db, "work_assessment", {"assessment_id": run.id}, work.project_id, upload.user_id)
    return run


def validate(context: dict, assessment: Assessment | None) -> list[CheckResult]:
    """Accept only known components and cited photos; anything missing stays explicitly unassessed."""
    elements = {e["id"]: e for e in context["elements"]}
    evidence = {p["id"] for p in context["photos"]}
    got = {}
    for o in assessment.observations if assessment else []:
        if (o.element_id not in elements or o.element_id in got or not set(o.evidence_ids) <= evidence
                or len(set(o.evidence_ids)) != len(o.evidence_ids)):
            raise ValueError("Invalid or duplicate assessment identifiers")
        if o.outcome == "pass" and not o.evidence_ids:
            raise ValueError("A passing observation must cite the photos that show it")
        got[o.element_id] = o
    checks = []
    for element in context["elements"]:
        o = got.get(element["id"])
        checks.append(CheckResult(
            check_code=CHECK_CODE, check_version=CHECK_VERSION, element_id=element["id"],
            outcome=o.outcome if o else "insufficient_evidence",
            observation=o.observation if o else "No observation returned for this component.",
            evidence_ids=o.evidence_ids if o else [],
            sources=[s for s in context["sources"] if s["locator"] == f"element:{element['id']}"],
            limitations=["Visible condition only; not an inspection, measurement, test or code-compliance result"]
            + (o.limitations if o else [])))
    return checks


def suggestion(checks: list[CheckResult], correction: bool) -> dict:
    """The decision the PM may want to take next. A suggestion only; the PM's own decision applies it."""
    outcomes = {c.outcome for c in checks}
    lines = [c.observation for c in checks]
    if "potential_discrepancy" in outcomes:
        return {"outcome": "potential_discrepancy", "decision": "reject" if correction else "confirm",
                "reason": " ".join(c.observation for c in checks if c.outcome == "potential_discrepancy")}
    if outcomes == {"pass"}:
        return {"outcome": "pass", "decision": "resolve" if correction else "accept", "reason": " ".join(lines)}
    missing = [c for c in checks if c.outcome in ("insufficient_evidence", "failed")]
    if missing:
        return {"outcome": "insufficient_evidence", "decision": "request",
                "reason": " ".join(c.observation for c in missing)}
    return {"outcome": "unsupported", "decision": None, "reason": " ".join(lines)}


def _finish(db: Session, run: WorkAssessment, status: str, result: dict) -> None:
    work = db.get(WorkPackage, run.work_id)
    # Newer evidence or a changed approved reference makes this run history, not a current suggestion.
    if status == "completed" and (work.state.get("update") != run.upload_id
                                  or work.version_id != run.context["model_version_id"]):
        status = "superseded"
    run.status, run.result, run.updated_at = status, result, datetime.now(UTC)
    text = {"completed": f"AI check suggestion: {result.get('suggestion', {}).get('outcome', 'unknown').replace('_', ' ')}. "
                         "Awaiting project-manager decision.",
            "superseded": "AI check finished after newer evidence or a reference change; kept as history only.",
            "failed": f"AI check failed ({result.get('error', {}).get('message', 'unknown error')}). Manual review continues."}[status]
    events.record(db, project_id=run.project_id, actor_id=None, type="work.ai_checked", entity_type="work",
                  entity_id=work.id, zone_id=work.state["location"]["roomId"],
                  data={"text": text, "tone": work.state["status"], "assessment_id": run.id, "status": status,
                        "model": result.get("model"), "prompt_version": PROMPT_VERSION, "policy_version": POLICY_VERSION},
                  evidence_ids=[p["id"] for p in run.context["photos"]])
    if status == "completed":
        managers = db.scalars(select(ProjectMember.user_id).where(
            ProjectMember.project_id == run.project_id, ProjectMember.role.in_([Role.pm, Role.owner]))).all()
        notify(db, managers, actor_id=None, project_id=run.project_id, kind="work.ai_checked",
               title=f"AI check ready: {work.state['title']}", body=text,
               link=f"/?project=api%3A{run.project_id}&panel=record&work={work.id}")


@jobs.handler("work_assessment")
def execute(db: Session, job) -> dict:
    run = db.get(WorkAssessment, job.payload["assessment_id"])
    if run is None or run.status != "queued":
        return {"skipped": True}
    run.status, run.attempts, run.updated_at = "running", run.attempts + 1, datetime.now(UTC)
    db.commit()
    context = run.context
    try:
        photos = []
        for record in context["photos"]:
            photo = db.get(Photo, record["id"])
            data = get_storage().get_bytes(photo.storage_key)
            if hashlib.sha256(data).hexdigest() != record["sha256"]:
                raise ValueError("Evidence checksum changed")
            photos.append((photo.id, analysis_copy(data)))
        db.rollback()  # do not hold a transaction open during provider I/O
        assessment, usage = provider.assess(context, photos)
        checks = validate(context, assessment)
        result = {**usage, "checks": [c.model_dump() for c in checks],
                  "suggestion": suggestion(checks, bool(context["correction_of_issue"]))}
        status = "completed"
    except vision.VisionUnavailable:
        status, result = "failed", {"error": {"code": "provider_unavailable", "message": "AI provider unavailable"}}
    except Exception as exc:  # noqa: BLE001 - provider errors may include private payloads; store a public message
        log.warning("work assessment %s failed: %s", run.id, type(exc).__name__)
        status, result = "failed", {"error": {"code": "analysis_failed", "message": "Check could not be completed"}}
    run = db.get(WorkAssessment, run.id)
    _finish(db, run, status, result)
    db.commit()
    return {"status": run.status}


def _on_fail(db: Session, job) -> None:
    run = db.get(WorkAssessment, (job.payload or {}).get("assessment_id"))
    if run and run.status in ("queued", "running"):
        _finish(db, run, "failed", {"error": {"code": "analysis_failed", "message": "Check could not be completed"}})
        db.commit()


jobs.ON_FAIL["work_assessment"] = _on_fail


def project(db: Session, upload_ids: list[str]) -> dict[str, dict]:
    """Latest check per update, shaped for the work record panel."""
    out: dict[str, dict] = {}
    if not upload_ids:
        return out
    for run in db.scalars(select(WorkAssessment).where(WorkAssessment.upload_id.in_(upload_ids))
                          .order_by(WorkAssessment.created_at)):
        out[run.upload_id] = {
            "id": run.id, "status": run.status, "checks": run.result.get("checks", []),
            "suggestion": run.result.get("suggestion"), "model": run.result.get("model"),
            "error": run.result.get("error"), "promptVersion": run.context.get("prompt_version"),
            "policyVersion": run.context.get("policy_version"), "at": run.updated_at.isoformat()}
    return out
