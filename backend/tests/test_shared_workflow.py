"""Two authenticated sessions coordinate the persisted daily loop; inference stays off."""
import io

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.models import Element, ElementRevision, Event, Issue, Photo, Project, Upload, WorkSubmission


def photo():
    buf = io.BytesIO()
    Image.new("RGB", (24, 24), "red").save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def site(api, db):
    actors = {name: api.register(f"{name}@shared.example.com", name.title())
              for name in ("pm", "crew", "other", "outsider", "viewer")}
    pid = api.project(actors["pm"])
    model = api.import_ifc(actors["pm"], pid)
    rev = db.scalar(select(ElementRevision).where(ElementRevision.version_id == model["version_id"],
                                                ElementRevision.trade == "hvac", ElementRevision.zone_id.is_not(None)))
    assert rev
    uid = api.c.get("/api/auth/me", headers=actors["crew"]).json()["id"]
    other_uid = api.c.get("/api/auth/me", headers=actors["other"]).json()["id"]
    assert api.add_member(actors["pm"], pid, "crew@shared.example.com", "trade", trades=["hvac"], zone_ids=[rev.zone_id]).status_code == 201
    assert api.add_member(actors["pm"], pid, "other@shared.example.com", "trade", trades=["plumbing"]).status_code == 201
    assert api.add_member(actors["pm"], pid, "viewer@shared.example.com", "viewer").status_code == 201
    payload = {"id": "WORK-shared-duct", "title": "Install duct", "element_id": rev.element_id,
               "model_version_id": model["version_id"], "assignee_id": uid,
               "capture_guidance": "Doorway context and close-up of duct connection"}
    r = api.c.post(f"/api/projects/{pid}/work", json=payload, headers=actors["pm"])
    assert r.status_code == 201, r.text
    return {**actors, "pid": pid, "version": model["version_id"], "work": r.json(), "payload": payload,
            "other_uid": other_uid}


def submit(api, site, key="capture-one", **overrides):
    data = {"client_uuid": key, "model_version_id": site["version"], "confirmed": "true",
            "note": "Duct connection needs review", "claim": "Reported complete",
            "captured_at": "2026-10-06T10:00:00+00:00", "captured_by": site["payload"]["assignee_id"], **overrides}
    return api.c.post(f"/api/work/{site['work']['id']}/updates", data=data,
                      files=[("files", ("duct.jpg", photo(), "image/jpeg"))], headers=site["crew"])


def decide(api, site, item, action, actor="pm", **extra):
    return api.c.post(f"/api/work/{item['id']}/decisions", json={"type": action,
        "reason": "Reviewed the visible connection against the approved reference",
        "expected_revision": item["serverRevision"], "update_id": item["update"], **extra}, headers=site[actor])


def current(api, site, actor="pm"):
    r = api.c.get(f"/api/projects/{site['pid']}/workspace", headers=site[actor])
    assert r.status_code == 200, r.text
    return r.json()


def test_two_user_correction_and_real_actor_history(api, db, site):
    assert current(api, site, "crew")["state"]["items"][0]["status"] == "none"
    first = submit(api, site)
    assert first.status_code == 201, first.text
    assert submit(api, site).json() == first.json()
    assert db.scalar(select(func.count()).select_from(Upload)) == 1
    assert db.scalar(select(func.count()).select_from(Photo)) == 1
    item = current(api, site)["state"]["items"][0]
    assert item["status"] == "review" and item["checks"] == []
    assert current(api, site, "crew")["permissions"]["review"] is False
    assert decide(api, site, item, "accept", "crew").status_code == 403
    confirmed = decide(api, site, item, "confirm", assignee_id=site["payload"]["assignee_id"], due="2026-10-07")
    assert confirmed.status_code == 200, confirmed.text
    issue = confirmed.json()
    assert issue["status"] == "issue"
    assert decide(api, site, issue, "resolve").status_code == 409
    assert api.c.patch(f"/api/issues/{issue['issue']}", json={"status": "closed"}, headers=site["crew"]).status_code == 409
    assert submit(api, site, "correction-two", claim="Correction submitted", note="Connection corrected").status_code == 201
    latest = current(api, site)["state"]["items"][0]
    assert latest["status"] == "issue" and latest["correction"]
    assert decide(api, site, issue, "resolve").status_code == 409
    done = decide(api, site, latest, "resolve")
    assert done.status_code == 200, done.text
    state = current(api, site, "crew")["state"]
    work = state["items"][0]
    assert work["status"] == "human" and not work.get("issue")
    assert work["review"] == "Correction accepted by Pm"
    assert len(work["photos"]) == 2 and work["assessments"]
    assert {e["actor"] for e in state["events"]} == {"Pm", "Crew"}
    assert db.get(Issue, issue["issue"]).status.value == "closed"
    db.expire_all()
    assert db.get(Element, site["payload"]["element_id"]).status.value == "done"
    assert db.scalar(select(WorkSubmission)).reference["location"]["version"] == site["version"]
    assert submit(api, site, "new-three", note="New concern found").status_code == 201
    assert current(api, site)["state"]["items"][0]["status"] == "review"
    assert db.scalar(select(func.count()).where(Event.type == "work.resolve")) == 1
    notifications = api.c.get("/api/notifications", headers=site["crew"]).json()
    assert any(n["kind"] == "work.resolve" and "panel=record" in n["link"] for n in notifications)


def test_scope_photo_access_retry_conflicts_and_invalid_intake(api, db, site):
    assert submit(api, site, confirmed="false").status_code == 422
    assert decide(api, site, site["work"], "accept").status_code == 422
    assert submit(api, site).status_code == 201
    item = current(api, site)["state"]["items"][0]
    url = item["photos"][0]["url"]
    assert api.c.get(url, headers=site["crew"]).status_code == 200
    assert api.c.get(url, headers=site["other"]).status_code == 404
    assert api.c.get(url, headers=site["outsider"]).status_code == 404
    assert api.c.get(url).status_code == 401
    assert current(api, site, "other")["state"]["items"] == []
    assert submit(api, site, note="Different evidence with same identity").status_code == 409
    assert decide(api, site, item, "accept", "viewer").status_code == 403
    assert decide(api, site, item, "assign", assignee_id=site["other_uid"], due="2026-10-07").status_code == 422
    r = api.c.post(f"/api/work/{item['id']}/updates", data={"client_uuid": "broken", "confirmed": True,
        "model_version_id": site["version"], "captured_by": site["payload"]["assignee_id"], "captured_at": "2026-10-06T10:00:00Z", "note": "Bad image"},
        files=[("files", ("bad.jpg", b"not a photo", "image/jpeg"))], headers=site["crew"])
    assert r.status_code == 422
    assert db.scalar(select(func.count()).select_from(Upload)) == 1


def test_changed_reference_never_reuses_old_completion_or_loses_receipt(api, db, site):
    assert submit(api, site).status_code == 201
    item = current(api, site)["state"]["items"][0]
    assert decide(api, site, item, "accept").status_code == 200
    new = api.import_ifc(site["pm"], site["pid"])
    db.expire_all()
    assert db.get(Project, site["pid"]).current_version_id == new["version_id"]
    stale = current(api, site)["state"]["items"][0]
    assert stale["status"] == "review" and stale["progress"] == "Reference changed"
    assert decide(api, site, stale, "accept").status_code == 409
    assert submit(api, site, "offline-stale").status_code == 409
    assert submit(api, site).status_code == 201
    updated = decide(api, site, stale, "reference")
    assert updated.status_code == 200, updated.text
    assert updated.json()["location"]["version"] == new["version_id"]
    assert decide(api, site, updated.json(), "accept").status_code == 422
    assert submit(api, site, "fresh-new", model_version_id=new["version_id"]).status_code == 201
