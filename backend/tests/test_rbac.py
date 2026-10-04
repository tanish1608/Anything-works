"""Role matrix tests: each role tries each kind of action against a real project."""

import pytest

from app.models import Role
from app.rbac import MATRIX, Perm


@pytest.fixture
def team(api):
    owner = api.register("owner@example.com")
    pid = api.project(owner)
    s = api.structure(owner, pid)
    heads = {"owner": owner}
    for role in ("pm", "trade", "viewer"):
        heads[role] = api.register(f"{role}@example.com")
        extra = {"trades": ["plumbing"], "zone_ids": [s["z1"]]} if role == "trade" else {}
        assert api.add_member(owner, pid, f"{role}@example.com", role, **extra).status_code == 201
    heads["outsider"] = api.register("outsider@example.com")
    return {"pid": pid, "s": s, "h": heads}


# (action name, callable(client, team) -> response, roles allowed)
ACTIONS = [
    ("view project", lambda c, t: c.get(f"/api/projects/{t['pid']}"), {"owner", "pm", "trade", "viewer"}),
    ("rename project", lambda c, t: c.patch(f"/api/projects/{t['pid']}", json={"name": "X"}), {"owner", "pm"}),
    ("add building", lambda c, t: c.post(f"/api/projects/{t['pid']}/buildings", json={"name": "B"}),
     {"owner", "pm"}),
    ("edit level", lambda c, t: c.patch(f"/api/levels/{t['s']['level']}", json={"height_m": 2.9}),
     {"owner", "pm"}),
    ("add zone", lambda c, t: c.post(f"/api/levels/{t['s']['level']}/zones", json={"name": "Z"}),
     {"owner", "pm"}),
    ("view history", lambda c, t: c.get(f"/api/projects/{t['pid']}/events"), {"owner", "pm", "trade", "viewer"}),
    ("list members", lambda c, t: c.get(f"/api/projects/{t['pid']}/members"),
     {"owner", "pm", "trade", "viewer"}),
]


@pytest.mark.parametrize("name,call,allowed", ACTIONS, ids=[a[0] for a in ACTIONS])
@pytest.mark.parametrize("role", ["owner", "pm", "trade", "viewer", "outsider"])
def test_role_matrix(client, team, name, call, allowed, role):
    client.headers.update(team["h"][role])
    r = call(client, team)
    client.headers.pop("Authorization")
    if role in allowed:
        assert r.status_code < 300, (role, name, r.text)
    elif role == "outsider":
        assert r.status_code == 404, (role, name, r.status_code)  # existence is not leaked
    else:
        assert r.status_code == 403, (role, name, r.status_code)


def test_matrix_shape():
    assert MATRIX[Role.viewer] == {Perm.project_view, Perm.history_view}
    assert Perm.progress_upload in MATRIX[Role.trade]
    assert Perm.model_approve not in MATRIX[Role.trade]


def test_trade_sees_only_assigned_zones(client, team):
    h, s = team["h"], team["s"]
    tree = client.get(f"/api/projects/{team['pid']}/tree", headers=h["trade"]).json()
    zones = [z["id"] for b in tree for lv in b["levels"] for z in lv["zones"]]
    assert zones == [s["z1"]]
    assert client.get(f"/api/zones/{s['z2']}", headers=h["trade"]).status_code == 404
    assert client.get(f"/api/zones/{s['z1']}", headers=h["trade"]).status_code == 200
    # Owner sees both
    tree = client.get(f"/api/projects/{team['pid']}/tree", headers=h["owner"]).json()
    assert len(tree[0]["levels"][0]["zones"]) == 2


def test_trade_history_is_zone_scoped(client, team):
    h, s = team["h"], team["s"]
    evs = client.get(f"/api/projects/{team['pid']}/events", headers=h["trade"]).json()
    assert evs and all(e["zone_id"] == s["z1"] for e in evs)
    assert not any(e["type"].startswith("member.") for e in evs)


def test_qr_lookup_respects_scope(client, team):
    h, s = team["h"], team["s"]
    z2 = client.get(f"/api/zones/{s['z2']}", headers=h["owner"]).json()
    assert client.get(f"/api/zones/by-qr/{z2['qr_token']}", headers=h["trade"]).status_code == 404
    assert client.get(f"/api/zones/by-qr/{z2['qr_token']}", headers=h["pm"]).json()["id"] == s["z2"]


def _member_id(client, pid, h, email):
    return next(m["id"] for m in client.get(f"/api/projects/{pid}/members", headers=h).json()
                if m["user"]["email"] == email)


def test_pm_cannot_manage_owners(client, api, team):
    pid, h = team["pid"], team["h"]
    api.register("new@example.com")
    assert api.add_member(h["pm"], pid, "new@example.com", "owner").status_code == 403
    assert api.add_member(h["pm"], pid, "new@example.com", "trade", trades=["electrical"]).status_code == 201
    owner_mid = _member_id(client, pid, h["pm"], "owner@example.com")
    assert client.patch(f"/api/projects/{pid}/members/{owner_mid}", json={"role": "viewer"},
                        headers=h["pm"]).status_code == 403
    assert client.delete(f"/api/projects/{pid}/members/{owner_mid}", headers=h["pm"]).status_code == 403
    trade_mid = _member_id(client, pid, h["pm"], "trade@example.com")
    assert client.patch(f"/api/projects/{pid}/members/{trade_mid}", json={"role": "owner"},
                        headers=h["pm"]).status_code == 403


def test_last_owner_is_protected(client, team):
    pid, h = team["pid"], team["h"]
    owner_mid = _member_id(client, pid, h["owner"], "owner@example.com")
    assert client.patch(f"/api/projects/{pid}/members/{owner_mid}", json={"role": "pm"},
                        headers=h["owner"]).status_code == 409
    assert client.delete(f"/api/projects/{pid}/members/{owner_mid}", headers=h["owner"]).status_code == 409


def test_member_validation(client, api, team):
    pid, h = team["pid"], team["h"]
    api.register("x@example.com")
    assert api.add_member(h["owner"], pid, "x@example.com", "trade", trades=["juggling"]).status_code == 422
    assert api.add_member(h["owner"], pid, "x@example.com", "trade", zone_ids=["nope"]).status_code == 422
    assert api.add_member(h["owner"], pid, "nobody@example.com", "viewer").status_code == 404
    assert api.add_member(h["owner"], pid, "pm@example.com", "viewer").status_code == 409


def test_zone_scope_can_be_cleared(client, team):
    pid, h, s = team["pid"], team["h"], team["s"]
    mid = _member_id(client, pid, h["owner"], "trade@example.com")
    r = client.patch(f"/api/projects/{pid}/members/{mid}", json={"clear_zone_scope": True}, headers=h["owner"])
    assert r.json()["zone_ids"] is None
    assert client.get(f"/api/zones/{s['z2']}", headers=h["trade"]).status_code == 200
