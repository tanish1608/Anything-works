import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from tests_helpers import jpeg

from app import jobs
from app.agent import provider, service
from app.agent.context import freeze_references
from app.agent.schemas import Assessment
from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    AgentAction,
    AgentRun,
    DrawingSheet,
    Element,
    ElementRevision,
    ElementStatus,
    Event,
    Issue,
    ModelVersion,
    Photo,
    Project,
    User,
)
from app.storage import get_storage


@pytest.fixture
def project(api, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "agent_enabled", True)
    owner = api.register("owner@example.com")
    pm = api.register("pm@example.com")
    worker = api.register("worker@example.com")
    outsider = api.register("other@example.com")
    pid = api.project(owner)
    locations = api.structure(owner, pid)
    api.add_member(owner, pid, "pm@example.com", "pm")
    api.add_member(owner, pid, "worker@example.com", "trade", trades=["plumbing"], zone_ids=[locations["z1"]])
    author = db.scalar(select(User).where(User.email == "owner@example.com"))
    version = ModelVersion(project_id=pid, number=1, source="conversion", status="approved", approved_by=author.id)
    sheet = DrawingSheet(project_id=pid, level_id=locations["level"], discipline="plumbing", name="Plumbing plan",
                         filename="plan.dxf", file_type="dxf", storage_key=f"projects/{pid}/test-plan.dxf",
                         status="detected", plan={"fixtures": [{"id": "sink", "kind": "kitchen_sink", "center": [1, 1]}]})
    get_storage().put_bytes(sheet.storage_key, b"explicit test drawing fixture")
    db.add_all([version, sheet])
    db.flush()
    element = Element(project_id=pid, ifc_guid="test-sink")
    db.add(element)
    db.flush()
    db.add(ElementRevision(version_id=version.id, element_id=element.id, ifc_class="IfcSanitaryTerminal", name="Sink",
                           discipline="plumbing", trade="plumbing", level_id=locations["level"], zone_id=locations["z1"],
                           props={"SiteMesh.SheetId": sheet.id, "SiteMesh.PlanId": "sink"}))
    db.get(Project, pid).current_version_id = version.id
    freeze_references(db, version, [sheet])
    db.commit()
    return {"pid": pid, "pm": pm, "worker": worker, "outsider": outsider, "version": version.id,
            "element": element.id, "sheet": sheet.id, "zone": locations["z1"], "other_zone": locations["z2"]}


def upload(client, p, seed=1):
    response = client.post(f"/api/projects/{p['pid']}/uploads", headers=p["worker"],
                           data={"zone_id": p["zone"], "trade": "plumbing", "client_uuid": str(uuid.uuid4()),
                                 "element_ids": json.dumps([p["element"]]), "model_version_id": p["version"]},
                           files=[("files", ("work.jpg", jpeg(seed), "image/jpeg"))])
    assert response.status_code == 201, response.text
    return response.json()


def passing(context, photos):
    element = context["elements"][0]
    return Assessment(observations=[{"element_id": element["id"], "outcome": "pass", "observation": "Sink visibly present",
                                      "evidence_ids": [photos[0][0]], "source_ids": element["source_ids"], "limitations": []}]), {
        "model": "test-provider-double", "input_tokens": 10, "output_tokens": 20}


def start(client, p, up, key="run-1"):
    return client.post(f"/api/projects/{p['pid']}/agent/runs", headers={**p["worker"], "Idempotency-Key": key},
                       json={"upload_id": up["id"], "model_version_id": p["version"]})


def decision(client, p, action, *, who="pm", key="decision-1", **changes):
    body = {"decision": "accept", "reason": "Reviewed the submitted view", "fingerprint": action["fingerprint"],
            "expected_revision": action["expected_revision"], **changes}
    return client.post(f"/api/agent/actions/{action['id']}/decision", headers={**p[who], "Idempotency-Key": key}, json=body)


def test_worker_assessment_pm_acceptance_persists(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "assess", passing)
    up = upload(client, project)
    response = start(client, project, up)
    assert response.status_code == 202, response.text
    assert response.headers["Cache-Control"] == "no-store"
    run = response.json()
    assert run["status"] == "awaiting_review" and run["model"] == "test-provider-double"
    assert run["checks"][0]["completion_eligible"] is False
    assert {s["kind"] for s in run["checks"][0]["sources"]} == {"model", "drawing"}
    notifications = client.get("/api/notifications", headers=project["pm"]).json()
    assert any(item["kind"] == "agent.review_requested" and item["link"] == f"/agent?run={run['id']}" for item in notifications)
    assert db.get(Element, project["element"]).status != ElementStatus.done
    action = run["actions"][0]
    assert decision(client, project, action, who="worker").status_code == 403
    accepted = decision(client, project, action)
    assert accepted.status_code == 200, accepted.text
    assert decision(client, project, action).json() == accepted.json()
    assert decision(client, project, action, key="competing-review").status_code == 409
    db.expire_all()
    assert db.get(Element, project["element"]).status == ElementStatus.done
    event = db.scalar(select(Event).where(Event.entity_id == project["element"], Event.type == "element.status_changed")
                       .order_by(Event.at.desc()))
    assert event.data["completion_basis"] == "human"
    assert up["photos"][0]["id"] in event.evidence_ids
    for who in ("worker", "pm"):
        saved = client.get(f"/api/agent/runs/{run['id']}", headers=project[who]).json()
        assert saved["status"] == "completed" and saved["actions"][0]["status"] == "applied"
    assert db.scalar(select(func.count()).select_from(Event).where(Event.type == "agent.decided")) == 1


def test_idempotency_aliases_and_changed_body(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "assess", passing)
    up = upload(client, project)
    run = start(client, project, up).json()
    assert start(client, project, up).json()["id"] == run["id"]
    assert start(client, project, up, "alias").json()["id"] == run["id"]
    wrong = {**project, "version": str(uuid.uuid4())}
    assert start(client, wrong, up, "alias").status_code == 409
    assert db.scalar(select(func.count()).select_from(AgentRun)) == 1


@pytest.mark.parametrize("change", ["replace", "remove"])
def test_review_rechecks_original_photo_bytes(client, db, project, monkeypatch, change):
    monkeypatch.setattr(provider, "assess", passing)
    up = upload(client, project)
    run = start(client, project, up).json()
    photo = db.get(Photo, up["photos"][0]["id"])
    if change == "replace":
        get_storage().put_bytes(photo.storage_key, jpeg(2))
    else:
        get_storage().local_path(photo.storage_key).unlink()
    response = decision(client, project, run["actions"][0])
    assert response.status_code == 409, response.text
    assert response.json()["code"] == "stale_revision"
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done
    assert db.get(AgentAction, run["actions"][0]["id"]).status == "proposed"
    assert db.scalar(select(func.count()).select_from(Event).where(Event.type == "agent.decided")) == 0


@pytest.mark.parametrize("scope", ["disjoint", "overlap", "unscoped"])
def test_newer_evidence_only_supersedes_intersecting_work(client, db, project, monkeypatch, scope):
    monkeypatch.setattr(provider, "assess", passing)
    second = Element(project_id=project["pid"], ifc_guid="second-sink")
    db.add(second)
    db.flush()
    db.add(ElementRevision(version_id=project["version"], element_id=second.id, ifc_class="IfcSanitaryTerminal",
                           name="Second sink", discipline="plumbing", trade="plumbing", zone_id=project["zone"],
                           props={"SiteMesh.SheetId": project["sheet"], "SiteMesh.PlanId": "sink"}))
    db.commit()
    run = start(client, project, upload(client, project)).json()
    claim = [second.id] if scope == "disjoint" else [project["element"]] if scope == "overlap" else []
    response = client.post(f"/api/projects/{project['pid']}/uploads", headers=project["worker"],
                           data={"zone_id": project["zone"], "trade": "plumbing", "client_uuid": str(uuid.uuid4()),
                                 "element_ids": json.dumps(claim), "model_version_id": project["version"]},
                           files=[("files", ("work.jpg", jpeg(2), "image/jpeg"))])
    assert response.status_code == 201, response.text
    response = decision(client, project, run["actions"][0])
    assert response.status_code == (200 if scope == "disjoint" else 409), response.text
    if scope != "disjoint":
        assert response.json()["code"] == "superseded"
    db.expire_all()
    assert (db.get(Element, project["element"]).status == ElementStatus.done) == (scope == "disjoint")


@pytest.mark.parametrize("defect", ["unknown_element", "unknown_photo", "unknown_source", "missing_citation", "duplicate", "malformed"])
def test_invalid_provider_results_never_complete(client, db, project, monkeypatch, defect):
    def bad(context, photos):
        assessment, usage = passing(context, photos)
        observation = assessment.observations[0]
        if defect == "unknown_element":
            observation.element_id = str(uuid.uuid4())
        elif defect == "unknown_photo":
            observation.evidence_ids = [str(uuid.uuid4())]
        elif defect == "unknown_source":
            observation.source_ids = [str(uuid.uuid4())]
        elif defect == "missing_citation":
            observation.evidence_ids = []
        elif defect == "duplicate":
            assessment.observations.append(observation)
        else:
            raise ValueError("malformed output with private provider data")
        return assessment, usage
    monkeypatch.setattr(provider, "assess", bad)
    run = start(client, project, upload(client, project)).json()
    assert run["status"] == "failed" and run["error"]["code"] == "analysis_failed"
    assert "private" not in run["error"]["message"]
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done
    assert not run["actions"]


def test_missing_approved_drawing_abstains_without_provider(client, db, project, monkeypatch):
    rev = db.scalar(select(ElementRevision).where(ElementRevision.element_id == project["element"]))
    rev.props = {}
    db.commit()
    monkeypatch.setattr(provider, "assess", lambda *args: pytest.fail("No approved drawing: must not call provider"))
    run = start(client, project, upload(client, project)).json()
    assert run["status"] == "awaiting_review" and run["checks"][0]["outcome"] == "insufficient_evidence"
    assert run["actions"][0]["kind"] == "request_evidence"
    assert decision(client, project, run["actions"][0]).status_code == 200
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


@pytest.mark.parametrize("change", ["drawing", "model", "newer_evidence", "issue", "fingerprint"])
def test_stale_or_blocked_review_never_completes(client, db, project, monkeypatch, change):
    monkeypatch.setattr(provider, "assess", passing)
    run = start(client, project, upload(client, project)).json()
    action = run["actions"][0]
    changes = {}
    if change == "drawing":
        db.get(DrawingSheet, project["sheet"]).plan = {"fixtures": []}
        db.commit()
    elif change == "model":
        db.get(Project, project["pid"]).current_version_id = None
        db.commit()
    elif change == "newer_evidence":
        upload(client, project, seed=2)
    elif change == "issue":
        db.add(Issue(project_id=project["pid"], number=1, title="Open defect", element_id=project["element"]))
        db.commit()
    else:
        changes["fingerprint"] = "a" * 64
    assert decision(client, project, action, **changes).status_code == 409
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


def test_scope_isolation_and_cancelled_execution(client, db, project, monkeypatch):
    monkeypatch.setattr(get_settings(), "jobs_mode", "thread")
    # Avoid starting a thread during this test: the fixture app lifespan already began in inline mode.
    up = upload(client, project)
    run = start(client, project, up).json()
    assert run["status"] == "queued"
    assert client.get(f"/api/agent/runs/{run['id']}", headers=project["outsider"]).status_code == 404
    response = client.post(f"/api/agent/runs/{run['id']}/cancel", headers={**project["worker"], "Idempotency-Key": "cancel"})
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    monkeypatch.setattr(provider, "assess", lambda *args: pytest.fail("Cancelled run must not invoke provider"))
    jobs.run_pending(SessionLocal)
    assert client.get(f"/api/agent/runs/{run['id']}", headers=project["pm"]).json()["status"] == "cancelled"
    assert db.scalar(select(func.count()).select_from(AgentAction)) == 0


def test_restart_reclaims_expired_lease_with_retry_budget(client, db, project, monkeypatch):
    monkeypatch.setattr(get_settings(), "jobs_mode", "thread")
    run = start(client, project, upload(client, project)).json()
    record = db.get(AgentRun, run["id"])
    record.status, record.attempts = "running", 1
    record.lease_token, record.lease_until = "old-worker", datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    service.recover(db)
    db.refresh(record)
    assert record.status == "queued" and record.lease_token is None
    monkeypatch.setattr(provider, "assess", passing)
    jobs.run_pending(SessionLocal)
    db.refresh(record)
    assert record.status == "awaiting_review" and record.attempts == 2
    record.status, record.lease_token = "running", "expired-again"
    record.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    service.recover(db)
    db.refresh(record)
    assert record.status == "failed" and record.result["error"]["code"] == "rate_limited"


def test_project_inbox_scope_and_flat_auth_errors(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "assess", passing)
    run = start(client, project, upload(client, project)).json()
    path = f"/api/projects/{project['pid']}/agent/runs"
    assert client.get(path).json() == {"code": "unauthenticated", "message": "Not authenticated"}
    assert client.get(path, headers=project["outsider"]).status_code == 404
    for role in ("pm", "worker"):
        listed = client.get(path, headers=project[role]).json()
        assert [item["id"] for item in listed] == [run["id"]]
        assert "context" not in listed[0] and "actor_id" not in listed[0]
    assert client.get(path + "?limit=101", headers=project["pm"]).json()["code"] == "invalid_input"
    worker = db.scalar(select(User).where(User.email == "worker@example.com"))
    from app.models import ProjectMember
    member = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id))
    member.zone_ids = [project["other_zone"]]
    db.commit()
    assert client.get(path, headers=project["worker"]).json() == []
    assert client.get(f"/api/agent/runs/{run['id']}", headers=project["worker"]).status_code == 404
    evidence = client.get(f"/api/uploads/{run['upload_id']}", headers=project["pm"]).json()
    assert client.get(f"/api/uploads/{run['upload_id']}", headers=project["worker"]).status_code == 404
    assert client.get(evidence["photos"][0]["url"], headers=project["worker"]).status_code == 404
    replay = client.post(f"/api/projects/{project['pid']}/uploads", headers=project["worker"],
                         data={"zone_id": project["zone"], "trade": "plumbing", "client_uuid": evidence["client_uuid"]},
                         files=[("files", ("work.jpg", jpeg(2), "image/jpeg"))])
    assert replay.status_code == 404


def test_cancel_requires_header_and_is_repeatable(client, project, monkeypatch):
    monkeypatch.setattr(get_settings(), "jobs_mode", "thread")
    run = start(client, project, upload(client, project)).json()
    path = f"/api/agent/runs/{run['id']}/cancel"
    assert client.post(path, headers=project["worker"]).status_code == 422
    headers = {**project["worker"], "Idempotency-Key": "cancel-1"}
    first = client.post(path, headers=headers)
    assert first.status_code == 200
    assert client.post(path, headers=headers).json() == first.json()


@pytest.mark.parametrize("change", ["drawing", "cancel", "expired_lease"])
def test_context_changes_during_provider_discard_observations(client, db, project, monkeypatch, change):
    def interrupted(context, photos):
        with SessionLocal() as other:
            run = other.scalar(select(AgentRun).where(AgentRun.upload_id == context["upload_id"]))
            if change == "drawing":
                other.get(DrawingSheet, project["sheet"]).plan = {"fixtures": []}
            elif change == "cancel":
                service.cancel(other, run, run.actor_id)
            else:
                run.lease_until = datetime.now(UTC) - timedelta(seconds=1)
            other.commit()
        return passing(context, photos)
    monkeypatch.setattr(provider, "assess", interrupted)
    run = start(client, project, upload(client, project)).json()
    assert run["status"] == {"drawing": "superseded", "cancel": "cancelled", "expired_lease": "running"}[change]
    assert run["actions"] == []
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


def test_stored_prompt_policy_provenance_is_not_relabelled(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "assess", passing)
    run = start(client, project, upload(client, project)).json()
    record = db.get(AgentRun, run["id"])
    record.context = {**record.context, "prompt_version": "older-prompt", "policy_version": "older-policy"}
    db.commit()
    response = client.get(f"/api/agent/runs/{run['id']}", headers=project["pm"]).json()
    assert response["prompt_version"] == "older-prompt" and response["policy_version"] == "older-policy"
    assert decision(client, project, run["actions"][0]).status_code == 409


def test_provider_disabled_fails_visibly_without_completion(client, db, project):
    run = start(client, project, upload(client, project)).json()
    assert run["status"] == "failed" and run["error"]["code"] == "provider_unavailable"
    assert run["actions"] == []
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done


def test_concurrent_create_reuses_one_run_and_same_decision_replays(client, db, project, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setattr(get_settings(), "jobs_mode", "thread")
    up = upload(client, project)
    with ThreadPoolExecutor(max_workers=2) as pool:
        requests = [pool.submit(start, client, project, up, "concurrent") for _ in range(2)]
        responses = [request.result() for request in requests]
    assert [response.status_code for response in responses] == [202, 202]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert db.scalar(select(func.count()).select_from(AgentRun)) == 1
    monkeypatch.setattr(provider, "assess", passing)
    jobs.run_pending(SessionLocal)
    run = client.get(f"/api/agent/runs/{responses[0].json()['id']}", headers=project["pm"]).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        requests = [pool.submit(decision, client, project, run["actions"][0]) for _ in range(2)]
        accepted = [request.result() for request in requests]
    assert [response.status_code for response in accepted] == [200, 200]
    assert accepted[0].json() == accepted[1].json()
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Event).where(Event.type == "agent.decided")) == 1


def test_fresh_evidence_rechecks_human_completed_work(client, db, project, monkeypatch):
    monkeypatch.setattr(provider, "assess", passing)
    original = start(client, project, upload(client, project)).json()
    assert decision(client, project, original["actions"][0]).status_code == 200
    db.expire_all()
    assert db.get(Element, project["element"]).status == ElementStatus.done
    called = []
    def uncertain(context, photos):
        called.append(context["elements"][0]["id"])
        assessment, usage = passing(context, photos)
        assessment.observations[0].outcome = "insufficient_evidence"
        return assessment, usage
    monkeypatch.setattr(provider, "assess", uncertain)
    new = start(client, project, upload(client, project, seed=2), key="new-report").json()
    assert new["id"] != original["id"] and called == [project["element"]]
    assert new["checks"][0]["outcome"] == "insufficient_evidence"
    db.expire_all()
    assert db.get(Element, project["element"]).status != ElementStatus.done
