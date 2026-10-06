import pytest
from tests_helpers import jpeg


@pytest.fixture
def proj(client, api):
    h = api.register("pm@example.com", "Pat")
    pid = api.project(h)
    api.import_ifc(h, pid)
    els = client.get(f"/api/projects/{pid}/elements", headers=h).json()
    ht = api.register("hvac@example.com", "Hank")
    api.add_member(h, pid, "hvac@example.com", "trade", trades=["hvac"])
    hv = api.register("insp@example.com")
    api.add_member(h, pid, "insp@example.com", "viewer")
    me = {m["user"]["email"]: m["user"]["id"] for m in client.get(f"/api/projects/{pid}/members", headers=h).json()}
    return {"pid": pid, "h": h, "ht": ht, "hv": hv, "els": els, "uid": me}


def _el(proj, cls):
    return next(e for e in proj["els"] if e["ifc_class"] == cls)


VP = {"position": [10, 5, 10], "target": [5, 1, -5], "section": None}


def test_issue_lifecycle_with_notifications_and_red_overlay(client, proj):
    pid, h, ht = proj["pid"], proj["h"], proj["ht"]
    duct = _el(proj, "IfcDuctSegment")
    r = client.post(f"/api/projects/{pid}/issues", headers=h, json={
        "title": "Duct clashes with beam", "priority": "high", "element_id": duct["id"],
        "assignee_id": proj["uid"]["hvac@example.com"], "anchor": [7.9, 3, -7.9], "viewpoint": VP,
        "due_date": "2026-10-10"})
    assert r.status_code == 201, r.text
    issue = r.json()
    assert issue["number"] == 1 and issue["trade"] == "hvac" and issue["viewpoint"]["position"] == [10, 5, 10]
    assert issue["assignee_name"] == "Hank"

    # Element turns red (open issue count) and the issue is in its history.
    els = {e["id"]: e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json()}
    assert els[duct["id"]]["open_issues"] == 1
    hist = client.get(f"/api/elements/{duct['id']}", headers=h).json()["history"]
    assert any(e["type"] == "element.issue_opened" for e in hist)

    # Assignee got notified, can move it along but can't reassign or close.
    notes = client.get("/api/notifications?unread=true", headers=ht).json()
    assert notes[0]["kind"] == "issue.assigned" and notes[0]["link"].endswith(issue["id"])
    assert client.patch(f"/api/issues/{issue['id']}", json={"status": "in_progress"}, headers=ht).status_code == 200
    assert client.patch(f"/api/issues/{issue['id']}", json={"assignee_id": None}, headers=ht).status_code == 403
    assert client.patch(f"/api/issues/{issue['id']}", json={"status": "closed"}, headers=ht).status_code == 403
    assert client.patch(f"/api/issues/{issue['id']}", json={"status": "resolved"}, headers=ht).status_code == 200
    # PM was notified about the status change and closes it -> no longer red.
    assert any(n["kind"] == "issue.status" for n in client.get("/api/notifications", headers=h).json())
    assert client.patch(f"/api/issues/{issue['id']}", json={"status": "closed"}, headers=h).json()["closed_at"]
    els = {e["id"]: e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json()}
    assert els[duct["id"]]["open_issues"] == 0

    # Every step is in the event log.
    types = [e["type"] for e in client.get(f"/api/projects/{pid}/events?entity_id={issue['id']}", headers=h).json()]
    assert types.count("issue.updated") == 3 and "issue.created" in types


def test_comments_and_attachments(client, proj):
    pid, h, ht = proj["pid"], proj["h"], proj["ht"]
    iss = client.post(f"/api/projects/{pid}/issues", headers=h, json={
        "title": "Check duct", "trade": "hvac", "assignee_id": proj["uid"]["hvac@example.com"]}).json()
    c = client.post(f"/api/issues/{iss['id']}/comments", json={"body": "On it"}, headers=ht)
    assert c.status_code == 201 and c.json()["author"]["name"] == "Hank"
    assert client.get("/api/notifications", headers=h).json()[0]["kind"] == "issue.comment"
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post(f"/api/issues/{iss['id']}/attachments", files=[("files", ("p.png", png, "image/png"))], headers=ht)
    assert r.status_code == 201
    url = r.json()[0]["url"]
    assert client.get(url, headers=h).content == png
    assert client.get(url, headers=proj["hv"]).status_code == 200  # viewer can read evidence
    bad = client.post(f"/api/issues/{iss['id']}/attachments", files=[("files", ("x.exe", b"MZ", "application/x-msdownload"))],
                      headers=h)
    assert bad.status_code == 415
    d = client.get(f"/api/issues/{iss['id']}", headers=h).json()
    assert len(d["comments"]) == 1 and len(d["attachments"]) == 1 and d["comment_count"] == 1


def test_filters(client, proj):
    pid, h = proj["pid"], proj["h"]
    for t, tr in [("A", "hvac"), ("B", "framing"), ("C", None)]:
        client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": t, "trade": tr})
    titles = lambda q: [i["title"] for i in client.get(f"/api/projects/{pid}/issues{q}", headers=h).json()]  # noqa: E731
    assert titles("") == ["C", "B", "A"]
    assert titles("?trade=hvac") == ["A"]
    iid = client.get(f"/api/projects/{pid}/issues?trade=framing", headers=h).json()[0]["id"]
    client.patch(f"/api/issues/{iid}", json={"status": "resolved"}, headers=h)
    assert titles("?status=open") == ["C", "A"]
    assert titles("?status=open&status=resolved") == ["C", "B", "A"]


def test_scoping_and_permissions(client, proj):
    pid, h, ht, hv = proj["pid"], proj["h"], proj["ht"], proj["hv"]
    client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "framing thing", "trade": "framing"})
    client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "hvac thing", "trade": "hvac"})
    assert [i["title"] for i in client.get(f"/api/projects/{pid}/issues", headers=ht).json()] == ["hvac thing"]
    # Viewers read but can't create or comment.
    assert len(client.get(f"/api/projects/{pid}/issues", headers=hv).json()) == 2
    assert client.post(f"/api/projects/{pid}/issues", headers=hv, json={"title": "x"}).status_code == 403
    # Trade can't pin to an element of another trade's layer.
    beam = _el(proj, "IfcBeam")
    assert client.post(f"/api/projects/{pid}/issues", headers=ht,
                       json={"title": "x", "element_id": beam["id"]}).status_code == 422
    # But can raise one on their own element; assignee must be a project member.
    duct = _el(proj, "IfcDuctSegment")
    assert client.post(f"/api/projects/{pid}/issues", headers=ht, json={"title": "mine", "element_id": duct["id"]}
                       ).status_code == 201
    assert client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "x", "assignee_id": "nobody"}
                       ).status_code == 422


def test_notifications_read(client, proj):
    pid, h, ht = proj["pid"], proj["h"], proj["ht"]
    client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "a", "assignee_id": proj["uid"]["hvac@example.com"]})
    n = client.get("/api/notifications?unread=true", headers=ht).json()
    assert len(n) == 1
    client.post(f"/api/notifications/{n[0]['id']}/read", headers=ht)
    assert client.get("/api/notifications?unread=true", headers=ht).json() == []
    # No self-notifications
    assert client.get("/api/notifications", headers=h).json() == []


def test_panel_blocked_by_duct_needs_pm_routing_and_keeps_issue_until_review(client, api, proj):
    """Cross-trade reporting is a known boundary; correction pending closure must stay prominent."""
    pid, pm, hvac = proj["pid"], proj["h"], proj["ht"]
    panel = api.register("panel@example.com", "Panel installer")
    assert api.add_member(pm, pid, "panel@example.com", "trade", trades=["framing"]).status_code == 201
    duct = _el(proj, "IfcDuctSegment")
    report = {"title": "Duct blocks panel installation", "element_id": duct["id"],
              "description": "Duct is not well installed; I cannot install the panel."}
    # The retained API cannot attach another trade's source element to this reporter's issue.
    rejected = client.post(f"/api/projects/{pid}/issues", headers=panel, json=report)
    assert rejected.status_code == 422 and rejected.json()["detail"] == "Unknown element"
    # Manual PM triage can place the issue and route it to the HVAC subcontractor.
    response = client.post(f"/api/projects/{pid}/issues", headers=pm,
                           json={**report, "assignee_id": proj["uid"]["hvac@example.com"],
                                 "due_date": "2026-10-08", "priority": "high"})
    assert response.status_code == 201, response.text
    issue = response.json()
    assert issue["trade"] == "hvac" and issue["model_version_id"]
    assert any(n["kind"] == "issue.assigned" for n in client.get("/api/notifications", headers=hvac).json())
    assert client.patch(f"/api/issues/{issue['id']}", headers=hvac,
                        json={"status": "in_progress"}).status_code == 200
    comment = client.post(f"/api/issues/{issue['id']}/comments", headers=hvac,
                          json={"body": "Duct adjusted. Ready for PM clearance review; panel work is still separate."})
    assert comment.status_code == 201 and comment.json()["author"]["name"] == "Hank"
    attachment = client.post(f"/api/issues/{issue['id']}/attachments", headers=hvac,
                             files=[("files", ("duct-correction.jpg", jpeg(22), "image/jpeg"))])
    assert attachment.status_code == 201
    assert client.patch(f"/api/issues/{issue['id']}", headers=hvac,
                        json={"status": "resolved"}).status_code == 200
    assert client.patch(f"/api/issues/{issue['id']}", headers=hvac,
                        json={"status": "closed"}).status_code == 403
    current = client.get(f"/api/elements/{duct['id']}", headers=pm).json()
    assert current["open_issues"] == 1
    assert client.patch(f"/api/issues/{issue['id']}", headers=pm,
                        json={"status": "closed"}).status_code == 200
    assert client.get(f"/api/elements/{duct['id']}", headers=pm).json()["open_issues"] == 0
    history = client.get(f"/api/projects/{pid}/events?entity_id={issue['id']}", headers=pm).json()
    assert {e["type"] for e in history} >= {"issue.created", "issue.updated", "issue.commented", "issue.attachments_added"}
