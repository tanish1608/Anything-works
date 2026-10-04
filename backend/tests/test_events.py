import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DatabaseError

from app.models import AppendOnlyViolation, Event


def test_every_change_is_logged(client, api):
    h = api.register("pm@example.com", "Pat")
    pid = api.project(h)
    s = api.structure(h, pid)
    client.patch(f"/api/zones/{s['z1']}", json={"name": "Renamed"}, headers=h)
    client.delete(f"/api/zones/{s['z2']}", headers=h)
    api.register("v@example.com")
    api.add_member(h, pid, "v@example.com", "viewer")

    evs = client.get(f"/api/projects/{pid}/events", headers=h).json()
    types = [e["type"] for e in reversed(evs)]
    assert types == ["project.created", "building.created", "level.created", "zone.created", "zone.created",
                     "zone.updated", "zone.deleted", "member.added"]
    upd = next(e for e in evs if e["type"] == "zone.updated")
    assert upd["data"] == {"before": {"name": "Unit 304, Bedroom 2"}, "after": {"name": "Renamed"}}
    assert upd["actor_name"] == "Pat" and upd["zone_id"] == s["z1"]
    deleted = next(e for e in evs if e["type"] == "zone.deleted")
    assert deleted["data"]["snapshot"]["name"] == "Unit 305, Kitchen"


def test_failed_change_logs_nothing(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    before = len(client.get(f"/api/projects/{pid}/events", headers=h).json())
    client.post(f"/api/projects/{pid}/members", json={"email": "ghost@example.com", "role": "viewer"}, headers=h)
    assert len(client.get(f"/api/projects/{pid}/events", headers=h).json()) == before


def test_pagination(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    b = client.post(f"/api/projects/{pid}/buildings", json={"name": "B"}, headers=h).json()
    for i in range(5):
        client.post(f"/api/buildings/{b['id']}/levels", json={"name": f"L{i}", "index": i}, headers=h)
    page1 = client.get(f"/api/projects/{pid}/events?limit=3", headers=h).json()
    page2 = client.get(f"/api/projects/{pid}/events?limit=3&before_id={page1[-1]['id']}", headers=h).json()
    ids = [e["id"] for e in page1 + page2]
    assert len(ids) == 6 and ids == sorted(ids, reverse=True)


def test_orm_refuses_event_update(client, api, db):
    h = api.register("pm@example.com")
    api.project(h)
    ev = db.scalars(select(Event)).first()
    ev.type = "tampered"
    with pytest.raises(AppendOnlyViolation):
        db.commit()
    db.rollback()
    db.delete(db.scalars(select(Event)).first())
    with pytest.raises(AppendOnlyViolation):
        db.commit()


def test_database_refuses_event_update_and_delete(client, api, engine):
    h = api.register("pm@example.com")
    api.project(h)
    for stmt in ("UPDATE events SET type = 'x'", "DELETE FROM events"):
        with pytest.raises(DatabaseError, match="append-only"), engine.begin() as c:
            c.execute(text(stmt))
