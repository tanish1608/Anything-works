"""New project → draft import → baseline approval → version-bound field evidence → human review."""
import json
import uuid

from tests_helpers import jpeg


def test_project_model_daily_update_workflow(client, api):
    h = api.register("model-workflow@example.com")
    pid = api.project(h)
    draft = api.import_ifc(h, pid, approve=False)
    assert client.get(f"/api/projects/{pid}/viewer", headers=h).json()["version"] is None
    assert client.get(f"/api/projects/{pid}/elements", headers=h).json() == []
    v1 = draft["version_id"]
    assert client.post(f"/api/models/{v1}/approve", headers=h, json={"message": "Reviewed rooms and components"}).status_code == 200
    elements = client.get(f"/api/projects/{pid}/elements", headers=h).json()
    target = next(e for e in elements if e["zone_id"] and not e["context"])
    zid, eid, trade = target["zone_id"], target["id"], target["trade"]
    checklist = client.get(f"/api/zones/{zid}/checklist?trade={trade}", headers=h).json()
    assert checklist["model_version_id"] == v1
    assert eid in {e["id"] for e in checklist["items"]}

    def submit(version, photo, key=None):
        return client.post(f"/api/projects/{pid}/uploads", headers=h,
                           data={"zone_id": zid, "trade": trade, "client_uuid": key or str(uuid.uuid4()),
                                 "element_ids": json.dumps([eid]), "model_version_id": version, "note": "Daily work update"},
                           files=[("files", ("work.jpg", photo, "image/jpeg"))])

    key = str(uuid.uuid4())
    response = submit(v1, jpeg(20), key)
    assert response.status_code == 201, response.text
    first = response.json()
    assert first["analysis_status"] == "off"
    assert first["verifications"][0]["state"] == "proposed"
    events = client.get(f"/api/projects/{pid}/events?entity_id={first['id']}", headers=h).json()
    handoff = next(e for e in events if e["type"] == "upload.created")
    assert handoff["data"]["model_version_id"] == v1
    assert handoff["data"]["capture_model_version_id"] == v1
    assert handoff["data"]["element_ids"] == [eid]
    assert handoff["evidence_ids"] == [first["photos"][0]["id"]]
    assert client.post(f"/api/verifications/{first['verifications'][0]['id']}/approve", headers=h,
                       json={"reason": "Reviewed field evidence"}).status_code == 200
    assert next(e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json() if e["id"] == eid)["status"] == "done"

    timeline = client.get(f"/api/projects/{pid}/timeline", headers=h).json()
    assert next(e for e in reversed(timeline["status_changes"]) if e["element_id"] == eid)["completion_basis"] == "human"
    fresh = submit(v1, jpeg(21))
    assert fresh.status_code == 201
    assert next(e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json() if e["id"] == eid)["status"] == "needs_review"
    # A new design revision cannot silently receive an offline update captured on the previous one.
    api.import_ifc(h, pid)
    old_proposal = fresh.json()["verifications"][0]["id"]
    assert client.post(f"/api/verifications/{old_proposal}/approve", headers=h, json={"reason": "Old evidence"}).status_code == 409
    stale = submit(v1, jpeg(22))
    assert stale.status_code == 409 and "model changed" in stale.json()["detail"]
    # A retry of an already received request still returns its original record, even after the revision changes.
    retry = submit(v1, jpeg(20), key)
    assert retry.status_code == 201 and retry.json()["id"] == first["id"]
