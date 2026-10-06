import base64
import io
import uuid
import wave
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from test_agent import project as project
from test_agent import upload

from app import jobs
from app.agent import provider, voice
from app.agent.provider import DraftSuggestions, FactSelection
from app.config import get_settings
from app.db import SessionLocal
from app.models import AgentSummary, AgentVoice, Element, ElementStatus, ProjectMember, User
from app.services import events
from app.vision.client import VisionUnavailable


def recording():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8000)
        output.writeframes(b"\0\0" * 800)
    return buffer.getvalue()


def create_voice(client, p, *, key="voice-1", who="worker", **changes):
    body = {"zone_id": p["zone"], "trade": "plumbing", "filename": "update.wav", "mime_type": "audio/wav",
            "captured_at": "2026-10-06T10:00:00-07:00", "audio_base64": base64.b64encode(recording()).decode(), **changes}
    return client.post(f"/api/projects/{p['pid']}/agent/voice", headers={**p[who], "Idempotency-Key": key}, json=body)


def test_record_transcribe_replay_and_correct_preserves_original(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "transcribe", lambda data, mime: ("Sink fitted in bathroom", "test-transcribe-double"))
    response = create_voice(client, project)
    assert response.status_code == 202, response.text
    note = response.json()
    assert note["status"] == "completed" and note["original_text"] == "Sink fitted in bathroom"
    assert create_voice(client, project).json()["id"] == note["id"]
    assert create_voice(client, project, filename="changed.wav").status_code == 409
    assert db.scalar(select(func.count()).select_from(AgentVoice)) == 1
    assert note["captured_at"] == "2026-10-06T17:00:00Z" and note["created_at"].endswith("Z")
    reread = client.get(f"/api/agent/voice/{note['id']}", headers=project["worker"]).json()
    assert reread["captured_at"] == note["captured_at"]
    for who in ("worker", "pm"):
        audio = client.get(note["original_url"], headers=project[who])
        assert audio.content == recording() and audio.headers["content-type"] == "audio/wav"
        assert audio.headers["cache-control"] == "no-store"
    correction = {"text": "Sink positioned, awaiting connection", "expected_revision": 0}
    path = f"/api/agent/voice/{note['id']}"
    assert client.patch(path, headers=project["pm"], json=correction).status_code == 403
    response = client.patch(path, headers=project["worker"], json=correction)
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["revision"] == 1 and edited["text"] == correction["text"] and edited["original_text"] == note["text"]
    assert client.patch(path, headers=project["worker"], json=correction).status_code == 409
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


@pytest.mark.parametrize("body", [{"audio_base64": "not base64"}, {"mime_type": "image/png"},
                                  {"audio_base64": base64.b64encode(b"not audio contents").decode()},
                                  {"captured_at": "2026-10-06T10:00:00"}])
def test_voice_validation_rejects_invalid_intake(client, project, body):
    assert create_voice(client, project, **body).status_code == 422


def test_voice_failure_preserves_audio_and_scope_rechecks(client, db, project, monkeypatch):
    def unavailable(data, mime):
        raise VisionUnavailable("explicit test failure")
    monkeypatch.setattr(provider, "transcribe", unavailable)
    note = create_voice(client, project).json()
    assert note["status"] == "failed" and note["error"]["code"] == "provider_unavailable"
    assert client.get(note["original_url"], headers=project["pm"]).content == recording()
    assert client.get(note["original_url"], headers=project["outsider"]).status_code == 404
    worker = db.scalar(select(User).where(User.email == "worker@example.com"))
    member = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id))
    member.zone_ids = [project["other_zone"]]
    db.commit()
    assert client.get(f"/api/agent/voice/{note['id']}", headers=project["worker"]).status_code == 404
    assert client.get(note["original_url"], headers=project["worker"]).status_code == 404
    assert client.get(f"/api/projects/{project['pid']}/agent/voice", headers=project["worker"]).json() == []
    assert create_voice(client, project).status_code == 404


def test_voice_expired_lease_recovery_fences_late_result(client, db, project, monkeypatch):
    monkeypatch.setattr(get_settings(), "jobs_mode", "thread")
    note = create_voice(client, project).json()
    def interrupted(data, mime):
        with SessionLocal() as other:
            item = other.get(AgentVoice, note["id"])
            item.lease_until = datetime.now(UTC) - timedelta(seconds=1)
            other.commit()
        return "late transcript", "test-double"
    monkeypatch.setattr(provider, "transcribe", interrupted)
    jobs.run_pending(SessionLocal)
    db.expire_all()
    assert db.get(AgentVoice, note["id"]).original_text is None
    voice.recover(db)
    monkeypatch.setattr(provider, "transcribe", lambda data, mime: ("Recovered transcript", "test-double"))
    jobs.run_pending(SessionLocal)
    db.expire_all()
    item = db.get(AgentVoice, note["id"])
    assert item.status == "completed" and item.attempts == 2 and item.text == "Recovered transcript"


def test_voice_scope_revoked_during_transcription_discards_result(client, db, project, monkeypatch):
    def revoked(data, mime):
        with SessionLocal() as other:
            worker = other.scalar(select(User).where(User.email == "worker@example.com"))
            member = other.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id))
            member.zone_ids = [project["other_zone"]]
            other.commit()
        return "unusable result", "test-double"
    monkeypatch.setattr(provider, "transcribe", revoked)
    note = create_voice(client, project).json()
    assert note["status"] == "failed" and note["original_text"] is None


def suggestions(client, p, **changes):
    return client.post(f"/api/projects/{p['pid']}/agent/suggestions", headers=p["worker"], json={
        "kind": "note", "input_revision": "draft-1", "text": "Sink positioned", "model_version_id": p["version"],
        "element_ids": [p["element"]], **changes})


def test_editable_suggestions_are_scoped_cited_and_read_only(client, db, project, monkeypatch):
    def draft(context):
        assert context["text"] == "Sink positioned"
        return DraftSuggestions(suggestions=[{"text": "Sink positioned; awaiting connection", "reason": "Clarifies the stated work",
                                              "element_ids": [project["element"]]}])
    monkeypatch.setattr(provider, "suggest", draft)
    result = suggestions(client, project).json()
    assert result["status"] == "available" and result["input_revision"] == "draft-1"
    assert result["suggestions"][0]["sources"][0]["id"] == project["version"]
    assert suggestions(client, project, element_ids=[str(uuid.uuid4())]).status_code == 404
    assert suggestions(client, project, model_version_id=str(uuid.uuid4())).status_code == 409
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


def test_unknown_suggestion_ids_and_failures_return_explained_empty(client, project, monkeypatch):
    monkeypatch.setattr(provider, "suggest", lambda context: DraftSuggestions(suggestions=[{
        "text": "Fabricated component", "reason": "Invalid fixture", "element_ids": [str(uuid.uuid4())]}]))
    result = suggestions(client, project).json()
    assert result["status"] == "unavailable" and result["suggestions"] == [] and result["reason"]


def test_suggestion_context_change_during_request_rejects_response(client, db, project, monkeypatch):
    def stale(context):
        with SessionLocal() as other:
            worker = other.scalar(select(User).where(User.email == "worker@example.com"))
            other.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id)).trades = []
            other.commit()
        return DraftSuggestions(suggestions=[{"text": "Old scope", "reason": "Old scope", "element_ids": [project["element"]]}])
    monkeypatch.setattr(provider, "suggest", stale)
    assert suggestions(client, project).status_code == 404


def summary_body():
    return {"date": datetime.now(UTC).date().isoformat(), "timezone": "UTC"}


def summary_get(client, p, who="pm", **changes):
    return client.get(f"/api/projects/{p['pid']}/agent/summary", headers=p[who], params={**summary_body(), **changes})


def summary_refresh(client, p, who="pm", **changes):
    return client.post(f"/api/projects/{p['pid']}/agent/summary/refresh", headers=p[who], json={**summary_body(), **changes})


def test_summary_is_persisted_cited_stale_and_get_never_generates(client, db, project, monkeypatch):
    calls = []
    def selection(context):
        calls.append(context)
        return FactSelection(event_ids=[context["facts"][0]["event_id"]])
    monkeypatch.setattr(provider, "select_facts", selection)
    upload(client, project)
    assert summary_get(client, project).json()["status"] == "unavailable" and not calls
    result = summary_refresh(client, project).json()
    assert result["status"] == "available" and result["partial_history"] is True
    assert result["statements"][0]["event_ids"]
    assert "Work update received" in result["statements"][0]["text"] or "needs review" in result["statements"][0]["text"]
    assert summary_get(client, project).json() == result and len(calls) == 1
    upload(client, project, seed=2)
    assert summary_get(client, project).json()["status"] == "stale" and len(calls) == 1
    assert summary_get(client, project).json()["statements"] == []
    assert db.scalar(select(func.count()).select_from(AgentSummary)) == 1
    assert summary_get(client, project, who="outsider").status_code == 404
    assert summary_get(client, project, timezone="not/a/timezone").status_code == 422


def test_summary_worker_context_filters_trade_before_limit_and_isolates_actor(client, db, project, monkeypatch):
    events.record(db, project_id=project["pid"], actor_id=None, type="upload.created", entity_type="upload",
                  entity_id=str(uuid.uuid4()), zone_id=project["zone"], data={"trade": "electrical"})
    upload(client, project)
    db.commit()
    def selection(context):
        assert all("electrical" not in fact["text"] for fact in context["facts"])
        return FactSelection(event_ids=[context["facts"][0]["event_id"]])
    monkeypatch.setattr(provider, "select_facts", selection)
    assert summary_refresh(client, project, who="worker").json()["status"] == "available"
    assert summary_get(client, project, who="pm").json()["status"] == "unavailable"
    worker = db.scalar(select(User).where(User.email == "worker@example.com"))
    db.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id)).trades = []
    db.commit()
    assert summary_get(client, project, who="worker").json()["statements"] == []


def test_summary_unknown_citations_are_unavailable(client, project, monkeypatch):
    upload(client, project)
    monkeypatch.setattr(provider, "select_facts", lambda context: FactSelection(event_ids=[99999999]))
    result = summary_refresh(client, project).json()
    assert result["status"] == "unavailable" and result["statements"] == []


def test_summary_new_event_during_generation_rejects_result(client, db, project, monkeypatch):
    upload(client, project)
    def changed(context):
        with SessionLocal() as other:
            events.record(other, project_id=project["pid"], actor_id=None, type="voice.received", entity_type="agent_voice",
                          entity_id=str(uuid.uuid4()), zone_id=project["zone"], data={"trade": "plumbing"})
            other.commit()
        return FactSelection(event_ids=[context["facts"][0]["event_id"]])
    monkeypatch.setattr(provider, "select_facts", changed)
    assert summary_refresh(client, project).status_code == 409
    assert db.scalar(select(func.count()).select_from(AgentSummary)) == 0
