"""AI photo analysis (M5): run the vision model on an upload and map verdicts onto the model.

Mapping (precision over recall: a false green is far worse than a false grey):
  installed, confidence >= project threshold → amber (needs review); green only if the project chose
                                                auto-approve. Never green without the upload's photos.
  installed below threshold                   → stays as it was; flagged "retake_photo".
  missing                                     → keeps its colour, flagged "possibly_missed"; worker + PM notified.
  not_visible / uncertain                     → keeps its colour, flagged "retake_photo"; worker asked to retake.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.models import Element, ElementStatus, Photo, Project, ProjectMember, Role, Upload, Verification, Zone
from app.services import events, progress
from app.services.notify import notify
from app.services.photos import analysis_copy
from app.storage import get_storage
from app.vision import client as vision
from app.vision.prompt import position_hint

log = logging.getLogger(__name__)


def maybe_enqueue_analysis(db: Session, upload: Upload) -> None:
    from app.config import get_settings

    if get_settings().agent_enabled:
        upload.analysis_status = "none"
        return
    if vision.mode() == "off":
        upload.analysis_status = "off"
        return
    upload.analysis_status = "queued"
    jobs.enqueue(db, "photo_analysis", {"upload_id": upload.id}, upload.project_id, upload.user_id)


def expected_elements(db: Session, project: Project, upload: Upload) -> list[dict]:
    z = db.get(Zone, upload.zone_id)
    out = []
    for rev, el in progress.current_revisions(db, project, upload.zone_id, upload.trade):
        if el.status == ElementStatus.done:
            continue  # already verified; don't re-litigate
        out.append({"id": el.id, "ifc_class": rev.ifc_class, "name": rev.name, "props": rev.props or {},
                    "position_hint": position_hint(rev.bbox, z.polygon if z else None)})
    return out


def apply_verdicts(db: Session, project: Project, upload: Upload, result: vision.AnalysisResult) -> dict:
    settings = project.settings or {}
    threshold = float(settings.get("confidence_threshold", 0.85))
    auto = settings.get("approval_mode") == "auto"
    summary = {"installed": 0, "approved": 0, "missing": 0, "retake": 0, "low_confidence": 0}
    missing_names, retake_names = [], []
    for v in result.verdicts:
        el = db.get(Element, v.element_id)
        if el is None or el.status == ElementStatus.done:
            continue
        confident_install = v.verdict == "installed" and v.confidence >= threshold
        ver = Verification(project_id=upload.project_id, upload_id=upload.id, element_id=el.id, verdict=v.verdict,
                           confidence=v.confidence, reason=v.reason, source="ai", model=result.model,
                           prompt_version=result.prompt_version, prev_status=el.status.value,
                           state="proposed" if confident_install else "noted")
        db.add(ver)
        db.flush()
        if confident_install:
            summary["installed"] += 1
            progress.set_status(db, el, ElementStatus.needs_review, actor_id=None, upload_id=upload.id,
                                zone_id=upload.zone_id, verification_id=ver.id, remove_flags=progress.CLEAR_ON_CLAIM,
                                reason=f"AI: installed ({v.confidence:.0%})")
            if auto:
                progress.approve(db, ver, actor_id=None, note=f"auto-approved: AI confidence {v.confidence:.0%} ≥ {threshold:.0%}")
                summary["approved"] += 1
        elif v.verdict == "missing":
            summary["missing"] += 1
            missing_names.append(el.id)
            progress.set_status(db, el, el.status, actor_id=None, upload_id=upload.id, zone_id=upload.zone_id,
                                verification_id=ver.id, add_flags={"possibly_missed"},
                                reason=f"AI: possibly missed ({v.reason})")
        else:
            key = "low_confidence" if v.verdict == "installed" else "retake"
            summary[key] += 1
            retake_names.append(el.id)
            progress.set_status(db, el, el.status, actor_id=None, upload_id=upload.id, zone_id=upload.zone_id,
                                verification_id=ver.id, add_flags={"retake_photo"},
                                reason=f"AI: {v.verdict.replace('_', ' ')} ({v.reason})")
    zone = db.get(Zone, upload.zone_id)
    link_worker = f"/field/{upload.project_id}/zone/{upload.zone_id}"
    managers = list(db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == upload.project_id,
                                                                   ProjectMember.role.in_([Role.pm, Role.owner]))))
    if summary["missing"]:
        notify(db, [upload.user_id, *managers], actor_id=None, project_id=upload.project_id, kind="progress.possibly_missed",
               title=f"{summary['missing']} item(s) possibly missed in {zone.name}",
               body="The photo check couldn't find them where the model expects them.", link=link_worker)
    if summary["retake"] or summary["low_confidence"]:
        notify(db, [upload.user_id], actor_id=None, project_id=upload.project_id, kind="progress.retake",
               title=f"Please take another photo in {zone.name}",
               body=f"{summary['retake'] + summary['low_confidence']} item(s) weren't clearly visible.", link=link_worker)
    return summary


@jobs.handler("photo_analysis")
def run_analysis(db: Session, job, client=None) -> dict:
    upload = db.get(Upload, job.payload["upload_id"])
    project = db.get(Project, upload.project_id)
    elements = expected_elements(db, project, upload)
    store = get_storage()
    photos = [analysis_copy(store.get_bytes(p.storage_key))
              for p in db.scalars(select(Photo).where(Photo.upload_id == upload.id).order_by(Photo.created_at))]
    reference = analysis_copy(store.get_bytes(upload.reference_key)) if upload.reference_key else None
    zone = db.get(Zone, upload.zone_id)
    try:
        result = vision.analyze(photos, reference, zone=zone.name if zone else "", trade=upload.trade,
                                note=upload.note, elements=elements, client=client)
    except vision.VisionUnavailable as e:
        upload.analysis_status, upload.analysis = "off", {"error": str(e)}
        db.commit()
        return {"skipped": str(e)}
    summary = apply_verdicts(db, project, upload, result)
    upload.analysis_status = "failed" if result.error else "done"
    upload.analysis = {**result.raw, "summary": summary, "model": result.model, "prompt_version": result.prompt_version}
    events.record(db, project_id=upload.project_id, actor_id=None, type="upload.analyzed", entity_type="upload",
                  entity_id=upload.id, zone_id=upload.zone_id, evidence_ids=[upload.id],
                  data={"model": result.model, "prompt_version": result.prompt_version, "summary": summary,
                        "error": result.error})
    db.commit()
    return summary
