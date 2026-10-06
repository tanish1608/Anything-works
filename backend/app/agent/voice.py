import base64
import binascii
import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import jobs
from app.agent import provider
from app.agent.context import digest, stamp
from app.agent.schemas import VoiceCorrection, VoiceCreate, VoiceNote
from app.config import get_settings
from app.models import AgentVoice, Building, Level, Project, Zone, new_id
from app.rbac import Perm, require, trade_visible, zone_visible
from app.services import events
from app.storage import get_storage
from app.vision.client import VisionUnavailable

MAX_AUDIO = 8 * 1024 * 1024


def authorize(db: Session, note: AgentVoice, actor_id: str, *, write=False):
    member = require(db, note.project_id, actor_id, Perm.progress_upload if write else Perm.history_view)
    if not zone_visible(member, note.zone_id) or not trade_visible(member, note.trade):
        raise HTTPException(404, {"code": "not_found", "message": "Voice update outside authorized scope"})
    return member


def load(db: Session, voice_id: str, actor_id: str) -> AgentVoice:
    note = db.get(AgentVoice, voice_id)
    if note is None:
        raise HTTPException(404, {"code": "not_found", "message": "Voice update not found"})
    authorize(db, note, actor_id)
    return note


def out(note: AgentVoice) -> VoiceNote:
    values = {key: getattr(note, key) for key in VoiceNote.model_fields if key != "original_url"}
    values.update(created_at=stamp(note.created_at), captured_at=stamp(note.captured_at) if note.captured_at else None)
    return VoiceNote(**values,
                     original_url=f"/api/agent/voice/{note.id}/file")


def original(note: AgentVoice) -> bytes:
    try:
        data = get_storage().get_bytes(note.storage_key)
    except OSError:
        raise HTTPException(409, {"code": "stale_revision", "message": "Original recording unavailable"}) from None
    if hashlib.sha256(data).hexdigest() != note.sha256:
        raise HTTPException(409, {"code": "stale_revision", "message": "Original recording changed"})
    return data


def create(db: Session, project_id: str, actor_id: str, body: VoiceCreate, key: str) -> AgentVoice:
    member = require(db, project_id, actor_id, Perm.progress_upload)
    zone = db.get(Zone, body.zone_id)
    level = db.get(Level, zone.level_id) if zone else None
    building = db.get(Building, level.building_id) if level else None
    if not building or building.project_id != project_id or not zone_visible(member, body.zone_id) or not trade_visible(member, body.trade):
        raise HTTPException(404, {"code": "not_found", "message": "Voice location/trade outside authorized scope"})
    if body.captured_at and body.captured_at.utcoffset() is None:
        raise HTTPException(422, {"code": "invalid_input", "message": "Capture time needs a timezone"})
    try:
        data = base64.b64decode(body.audio_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, {"code": "invalid_input", "message": "Invalid base64 recording"}) from None
    magic = {"audio/wav": data[:4] == b"RIFF" and data[8:12] == b"WAVE",
             "audio/mpeg": data[:3] == b"ID3" or (len(data) > 1 and data[0] == 255 and data[1] & 224 == 224),
             "audio/m4a": data[4:8] == b"ftyp", "audio/mp4": data[4:8] == b"ftyp",
             "audio/ogg": data[:4] == b"OggS", "audio/webm": data[:4] == b"\x1aE\xdf\xa3"}
    if not 12 <= len(data) <= MAX_AUDIO or not magic[body.mime_type]:
        raise HTTPException(422, {"code": "invalid_input", "message": "Use WAV, MP3, M4A, Ogg or WebM audio up to 8 MiB"})
    sha = hashlib.sha256(data).hexdigest()
    request_hash = digest({**body.model_dump(mode="json", exclude={"audio_base64"}), "sha256": sha})
    db.execute(update(Project).where(Project.id == project_id).values(name=Project.name))
    db.expire_all()
    authorize(db, AgentVoice(project_id=project_id, zone_id=body.zone_id, trade=body.trade), actor_id, write=True)
    existing = db.scalar(select(AgentVoice).where(AgentVoice.project_id == project_id,
                         AgentVoice.actor_id == actor_id, AgentVoice.idempotency_key == key))
    if existing:
        authorize(db, existing, actor_id, write=True)
        if existing.input_hash != request_hash:
            raise HTTPException(409, {"code": "idempotency_conflict", "message": "Retry recording data changed"})
        return existing
    note = AgentVoice(id=new_id(), project_id=project_id, actor_id=actor_id, zone_id=body.zone_id, trade=body.trade,
                      filename=body.filename, mime_type=body.mime_type,
                      captured_at=body.captured_at.astimezone(UTC) if body.captured_at else None,
                      idempotency_key=key, input_hash=request_hash, sha256=sha,
                      storage_key=f"projects/{project_id}/voice/{new_id()}/original")
    get_storage().put_bytes(note.storage_key, data)
    db.add(note)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        get_storage().local_path(note.storage_key).unlink(missing_ok=True)
        raise HTTPException(409, {"code": "idempotency_conflict", "message": "Recording retry raced; retry the same request"}) from None
    jobs.enqueue(db, "agent_transcription", {"voice_id": note.id}, project_id, actor_id)
    events.record(db, project_id=project_id, actor_id=actor_id, type="voice.received", entity_type="agent_voice",
                  entity_id=note.id, zone_id=note.zone_id,
                  data={"trade": note.trade, "sha256": sha, "captured_at": body.captured_at.isoformat() if body.captured_at else None})
    return note


def correct(db: Session, note: AgentVoice, actor_id: str, body: VoiceCorrection) -> AgentVoice:
    db.execute(update(Project).where(Project.id == note.project_id).values(name=Project.name))
    db.expire_all()
    authorize(db, note, actor_id, write=True)
    if note.actor_id != actor_id:
        raise HTTPException(403, {"code": "forbidden", "message": "Only the author can correct this transcript"})
    text = body.text.strip()
    if not text:
        raise HTTPException(422, {"code": "invalid_input", "message": "A transcript cannot be blank"})
    original(note)
    n = db.execute(update(AgentVoice).where(AgentVoice.id == note.id, AgentVoice.status == "completed",
                                          AgentVoice.revision == body.expected_revision)
                   .values(text=text, revision=AgentVoice.revision + 1)).rowcount
    if not n:
        raise HTTPException(409, {"code": "stale_revision", "message": "Transcript changed or is not completed"})
    events.record(db, project_id=note.project_id, actor_id=actor_id, type="voice.corrected", entity_type="agent_voice",
                  entity_id=note.id, zone_id=note.zone_id,
                  data={"trade": note.trade, "revision": body.expected_revision + 1, "text_sha256": digest(text)})
    db.flush()
    db.refresh(note)
    return note


@jobs.handler("agent_transcription")
def execute(db: Session, job) -> dict:
    voice_id, token = job.payload["voice_id"], new_id()
    now = datetime.now(UTC)
    n = db.execute(update(AgentVoice).where(AgentVoice.id == voice_id, AgentVoice.status == "queued")
        .values(status="running", attempts=AgentVoice.attempts + 1, lease_token=token,
                lease_until=now + timedelta(seconds=get_settings().agent_voice_timeout_seconds + 15))).rowcount
    db.commit()
    if not n:
        return {"skipped": True}
    note = db.get(AgentVoice, voice_id)
    error, text, model = None, None, None
    try:
        authorize(db, note, note.actor_id, write=True)
        data, mime = original(note), note.mime_type
        db.rollback()
        text, model = provider.transcribe(data, mime)
        if not isinstance(text, str) or not text.strip() or len(text) > 5000:
            raise ValueError("Invalid transcript")
        db.execute(update(Project).where(Project.id == note.project_id).values(name=Project.name))
        db.expire_all()
        note = db.get(AgentVoice, voice_id)
        authorize(db, note, note.actor_id, write=True)
        original(note)
    except VisionUnavailable:
        error = {"code": "provider_unavailable", "message": "Transcription provider unavailable; original recording retained"}
    except Exception:  # noqa: BLE001 - credential/private SDK errors must not reach job logs or clients
        error = {"code": "analysis_failed", "message": "Transcription failed; original recording retained"}
    now = datetime.now(UTC)
    n = db.execute(update(AgentVoice).execution_options(synchronize_session="fetch").where(AgentVoice.id == voice_id, AgentVoice.status == "running",
                                          AgentVoice.lease_token == token, AgentVoice.lease_until > now)
        .values(status="failed" if error else "completed", error=error,
                original_text=None if error else text, text=None if error else text, model=model, lease_token=None)).rowcount
    if n and not error:
        events.record(db, project_id=note.project_id, actor_id=note.actor_id, type="voice.transcribed", entity_type="agent_voice",
                      entity_id=note.id, zone_id=note.zone_id, data={"trade": note.trade, "model": model})
    db.commit()
    return {"written": bool(n)}


def recover(db: Session) -> None:
    now = datetime.now(UTC)
    rows = db.scalars(select(AgentVoice).where(AgentVoice.status == "running", AgentVoice.lease_until <= now)).all()
    for note in rows:
        retry = note.attempts < 2
        n = db.execute(update(AgentVoice).execution_options(synchronize_session="fetch").where(AgentVoice.id == note.id, AgentVoice.status == "running",
                                              AgentVoice.lease_token == note.lease_token, AgentVoice.lease_until <= now)
            .values(status="queued" if retry else "failed", lease_token=None,
                    error=None if retry else {"code": "rate_limited", "message": "Transcription attempt limit reached"})).rowcount
        if n and retry:
            jobs.enqueue(db, "agent_transcription", {"voice_id": note.id}, note.project_id, note.actor_id)
    db.commit()


jobs.RECOVER.append(recover)
