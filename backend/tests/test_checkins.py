"""Daily check-ins about anything on site: scoped catalog, location suggestions, work created or reused."""
import pytest
from sqlalchemy import select
from test_shared_workflow import current, photo, site  # noqa: F401 - shared fixture/helpers

from app.agent import locate
from app.config import get_settings
from app.models import ElementRevision, WorkPackage


def checkin(api, site_, actor, element_id, key="chk-1", **extra):
    me = api.c.get("/api/auth/me", headers=site_[actor]).json()["id"]
    data = {"element_id": element_id, "client_uuid": key, "model_version_id": site_["version"], "confirmed": "true",
            "captured_by": me, "note": "Kitchen sink connected", "claim": "", "captured_at": "2026-10-06T10:00:00+00:00",
            **extra}
    return api.c.post(f"/api/projects/{site_['pid']}/checkins", data=data,
                      files=[("files", ("sink.jpg", photo(), "image/jpeg"))], headers=site_[actor])


def element(db, site_, not_trade="hvac"):
    """A component outside the HVAC crew's trade (the sample has architecture, structure and HVAC)."""
    return db.scalar(select(ElementRevision).where(ElementRevision.version_id == site_["version"],
                                                   ElementRevision.trade != not_trade, ElementRevision.zone_id.is_not(None),
                                                   ElementRevision.bbox.is_not(None)).order_by(ElementRevision.element_id))


def test_catalog_is_scoped_and_marks_existing_work(api, db, site):  # noqa: F811
    pm = api.c.get(f"/api/projects/{site['pid']}/checkins/catalog", headers=site["pm"]).json()
    crew = api.c.get(f"/api/projects/{site['pid']}/checkins/catalog", headers=site["crew"]).json()
    pm_trades = {c["trade"] for r in pm["rooms"] for c in r["components"]}
    crew_components = [c for r in crew["rooms"] for c in r["components"]]
    assert len(pm_trades) > 1 and crew_components
    assert {c["trade"] for c in crew_components} == {"hvac"}
    tracked = [c for c in crew_components if c["element_id"] == site["payload"]["element_id"]]
    assert tracked and tracked[0]["work_id"] == site["work"]["id"]
    assert api.c.get(f"/api/projects/{site['pid']}/checkins/catalog", headers=site["viewer"]).status_code == 403


def test_pm_can_log_anything_and_it_becomes_tracked_work(api, db, site):  # noqa: F811
    rev = element(db, site)
    r = checkin(api, site, "pm", rev.element_id, title="Kitchen sink — plumbing connection")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["received"] and body["work_id"].startswith("CHK-")
    assert checkin(api, site, "pm", rev.element_id, title="Kitchen sink — plumbing connection").json() == body  # retry
    item = next(i for i in current(api, site)["state"]["items"] if i["id"] == body["work_id"])
    assert item["title"] == "Kitchen sink — plumbing connection" and item["status"] == "review"
    assert item["location"]["elements"] == [rev.element_id]
    assert len(item["photos"]) == 1
    # A second check-in on the same component is added to the same work, not a duplicate.
    again = checkin(api, site, "pm", rev.element_id, key="chk-2")
    assert again.json()["work_id"] == body["work_id"]
    assert db.scalar(select(WorkPackage).where(WorkPackage.element_id == rev.element_id)).id == body["work_id"]


def test_crew_check_in_on_assigned_component_adds_to_existing_work(api, db, site):  # noqa: F811
    r = checkin(api, site, "crew", site["payload"]["element_id"])
    assert r.status_code == 201, r.text
    assert r.json()["work_id"] == site["work"]["id"]
    item = current(api, site, "crew")["state"]["items"][0]
    assert item["status"] == "review" and item["update"] == r.json()["upload_id"]


def test_crews_stay_within_their_trade_and_cannot_log_on_another_crews_work(api, db, site):  # noqa: F811
    plumbing = element(db, site)
    assert checkin(api, site, "crew", plumbing.element_id).status_code in (403, 422)
    # The plumber cannot add to the HVAC crew's assigned work.
    assert checkin(api, site, "other", site["payload"]["element_id"]).status_code == 403
    assert db.scalar(select(WorkPackage).where(WorkPackage.element_id == plumbing.element_id)) is None


@pytest.fixture
def ai(monkeypatch):
    monkeypatch.setattr(get_settings(), "agent_enabled", True)
    monkeypatch.setattr("app.vision.client.mode", lambda: "gemini")


def test_locate_suggests_only_rooms_and_components_in_scope(api, db, site, ai, monkeypatch):  # noqa: F811
    crew = api.c.get(f"/api/projects/{site['pid']}/checkins/catalog", headers=site["crew"]).json()
    seen = []

    def fake(system, context, photos, schema):
        seen.append(context)
        first = context["rooms"][0]
        return {"picks": [{"room": "r99", "type": "r99t0"}, {"room": first["room"], "type": first["types"][0]["type"]},
                          {"room": first["room"], "type": "r0t999"}],
                "title": "Supply duct — connection", "message": "Ductwork at ceiling"}
    monkeypatch.setattr(locate, "ask", fake)
    r = api.c.post(f"/api/projects/{site['pid']}/checkins/locate", data={"note": "duct done"},
                   files=[("files", ("duct.jpg", photo(), "image/jpeg"))], headers=site["crew"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "available" and body["title"] == "Supply duct — connection"
    assert len(body["suggestions"]) == 1
    room = crew["rooms"][0]
    assert body["suggestions"][0]["room"] == room["name"]
    assert body["suggestions"][0]["element_id"] in {c["element_id"] for c in room["components"]}
    # The crew's context only ever lists HVAC types in their scope.
    assert {t["trade"] for r_ in seen[0]["rooms"] for t in r_["types"]} == {"hvac"}


def test_locate_without_ai_lets_the_person_choose(api, site):  # noqa: F811
    r = api.c.post(f"/api/projects/{site['pid']}/checkins/locate", data={"note": "anything"}, headers=site["pm"])
    assert r.status_code == 200 and r.json()["status"] == "unavailable" and r.json()["suggestions"] == []


def test_element_guid_lookup_translates_both_ways_within_the_project(api, db, site):  # noqa: F811
    from app.models import Element
    el = db.get(Element, site["payload"]["element_id"])
    r = api.c.post(f"/api/projects/{site['pid']}/element-guids", json={"ids": [el.id, "nope"], "guids": [el.ifc_guid]},
                   headers=site["crew"])
    assert r.status_code == 200
    assert r.json() == {"ids": {el.id: el.ifc_guid}, "guids": {el.ifc_guid: el.id}}
    assert api.c.post(f"/api/projects/{site['pid']}/element-guids", json={"ids": [el.id]},
                      headers=site["outsider"]).status_code == 404
