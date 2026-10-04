import json

from tests_helpers import jpeg, login

from app.seed import seed


def _setup(db, client):
    p = seed(db)
    return p.id, login(client, "pm@example.com")


def test_diff_between_versions(client, db):
    pid, pm = _setup(db, client)
    v1 = client.get(f"/api/projects/{pid}/models", headers=pm).json()[0]["id"]
    sheets = client.get(f"/api/projects/{pid}/sheets", headers=pm).json()
    arch = next(s for s in sheets if s["name"] == "duplex_L1_arch.dxf")
    plumb = next(s for s in sheets if s["name"] == "duplex_L1_plumbing.dxf")
    plan = client.get(f"/api/sheets/{arch['id']}", headers=pm).json()["plan"]
    w0, w1 = plan["walls"][0]["id"], plan["walls"][1]["id"]
    client.post(f"/api/sheets/{arch['id']}/edits", headers=pm, json={"ops": [
        {"op": "delete", "kind": "wall", "id": w0}, {"op": "update_wall", "id": w1, "thickness": 0.3}]})
    client.post(f"/api/sheets/{plumb['id']}/edits", headers=pm, json={"ops": [
        {"op": "add_pipe", "system": "cold", "points": [[1, 1], [1, 2]]}]})
    v2 = client.post(f"/api/projects/{pid}/conversions", headers=pm, json={"message": "rev B"}).json()["result"]["version_id"]
    d = client.get(f"/api/projects/{pid}/models/diff?from={v1}&to={v2}", headers=pm).json()
    assert [r["ifc_class"] for r in d["added"]] == ["IfcPipeSegment"]
    assert "IfcWall" in {r["ifc_class"] for r in d["removed"]}
    assert any(r["ifc_class"] == "IfcWall" and "geometry" in r["changed_fields"] for r in d["changed"] + d["moved"])
    assert d["unchanged"] > 50
    # inspector (viewer) may read history; draft is hidden from them
    insp = login(client, "inspector@example.com")
    assert client.get(f"/api/projects/{pid}/models/diff?from={v1}&to={v2}", headers=insp).status_code == 404


def test_timeline_replays_status_and_issues(client, db):
    pid, pm = _setup(db, client)
    plumber = login(client, "plumber@example.com")
    tree = client.get(f"/api/projects/{pid}/tree", headers=pm).json()
    bath = next(z["id"] for b in tree for lv in b["levels"] for z in lv["zones"] if z["name"] == "UNIT 101 BATH")
    item = client.get(f"/api/zones/{bath}/checklist", headers=plumber).json()["items"][0]
    up = client.post(f"/api/projects/{pid}/uploads", headers=plumber,
                     data={"zone_id": bath, "trade": "plumbing", "client_uuid": "t1", "element_ids": json.dumps([item["id"]])},
                     files=[("files", ("a.jpg", jpeg(21), "image/jpeg"))]).json()
    client.post(f"/api/verifications/{up['verifications'][0]['id']}/approve", json={}, headers=pm)
    client.post(f"/api/projects/{pid}/issues", headers=pm, json={"title": "Leak", "element_id": item["id"]})
    t = client.get(f"/api/projects/{pid}/timeline", headers=pm).json()
    seq = [c["status"] for c in t["status_changes"] if c["element_id"] == item["id"]]
    assert seq == ["needs_review", "done"]
    assert t["issues"][0]["element_id"] == item["id"] and t["issues"][0]["closed_at"] is None
    assert t["versions"][0]["number"] == 1 and t["start"] <= t["end"]
    # trade members only get their visible elements
    tt = client.get(f"/api/projects/{pid}/timeline", headers=plumber).json()
    assert {c["element_id"] for c in tt["status_changes"]} == {item["id"]}


def test_branch_proposal_and_merge(client, db, api):
    h = api.register("o@example.com")
    pid = api.project(h)
    api.import_ifc(h, pid)  # v1 main
    files = [("files", (n, open(f"../samples/ifc/{n}", "rb").read(), "x")) for n in ("Building-Architecture.ifc",)]
    job = client.post(f"/api/projects/{pid}/models/import", files=files, data={"message": "Option B: no structure", "branch": "option-b"},
                      headers=h).json()
    vb = job["result"]["version_id"]
    assert client.post(f"/api/models/{vb}/approve", json={}, headers=h).status_code == 200
    versions = client.get(f"/api/projects/{pid}/models", headers=h).json()
    cur = next(v for v in versions if v["is_current"])
    assert cur["number"] == 1  # approving on a branch doesn't change what's live
    m = client.post(f"/api/models/{vb}/merge", json={"message": "Go with option B"}, headers=h).json()
    assert m["is_current"] and m["number"] == 3 and m["parent_id"] == cur["id"] and m["branch"] == "main"
    els = client.get(f"/api/projects/{pid}/elements", headers=h).json()
    assert {e["discipline"] for e in els} <= {"architecture", "other"}
    assert client.post(f"/api/models/{m['id']}/merge", json={}, headers=h).status_code == 409
    types = [e["type"] for e in client.get(f"/api/projects/{pid}/events", headers=h).json()]
    assert "model.merged" in types
