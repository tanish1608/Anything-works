import json
from pathlib import Path

import pytest

SAMPLES = Path(__file__).resolve().parents[2] / "samples"

EXP = json.loads((SAMPLES / "dxf" / "expected.json").read_text())


@pytest.fixture
def proj(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    b = client.post(f"/api/projects/{pid}/buildings", json={"name": "House A"}, headers=h).json()
    lv = client.post(f"/api/buildings/{b['id']}/levels", json={"name": "Level 1", "height_m": 3.0}, headers=h).json()
    return {"h": h, "pid": pid, "level": lv["id"]}


def upload(client, proj, name, discipline, level=True):
    r = client.post(f"/api/projects/{proj['pid']}/sheets", headers=proj["h"],
                    files={"file": (name, (SAMPLES / "dxf" / name).read_bytes(), "application/dxf")},
                    data={"discipline": discipline, **({"level_id": proj["level"]} if level else {})})
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] == "done", job
    return job["result"]["sheet_id"]


@pytest.mark.parametrize("name", [n for n, e in EXP.items()])
def test_detection_matches_ground_truth(client, proj, name):
    e = EXP[name]
    sid = upload(client, proj, name, e["discipline"])
    s = client.get(f"/api/sheets/{sid}", headers=proj["h"]).json()
    c = s["counts"]
    assert s["status"] == "detected"
    if e["discipline"] == "architecture":
        assert c["doors"] == e["doors"] and c["windows"] == e["windows"]
        assert c["cased_openings"] == e["cased_openings"]
        assert abs(c["wall_centerline_m"] - e["wall_centerline_m"]) / e["wall_centerline_m"] < 0.05
        assert sorted(r["name"] for r in s["plan"]["rooms"]) == sorted(e["rooms"])
    if e["discipline"] == "plumbing":
        assert c["fixtures"] == e["fixtures"]
        assert c["pipe_segments"] == e["pipe_segments"]
        if e["pipe_segments"] == 0:
            assert any("No pipe runs are drawn" in w for w in s["warnings"])
    if e["discipline"] == "electrical":
        assert c["devices"] == e["devices"]


def test_dwg_rejected_with_help(client, proj):
    r = client.post(f"/api/projects/{proj['pid']}/sheets", headers=proj["h"],
                    files={"file": ("plan.dwg", b"AC1032", "application/acad")}, data={"discipline": "architecture"})
    assert r.status_code == 422 and "DXF" in r.json()["detail"]


def test_svg_render(client, proj):
    sid = upload(client, proj, "house_a_L1_arch.dxf", "architecture")
    r = client.get(f"/api/sheets/{sid}/svg", headers=proj["h"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert b'data-role="wall"' in r.content and b"LIVING" in r.content


def test_full_pipeline_review_build_approve(client, proj, api):
    h, pid = proj["h"], proj["pid"]
    arch = upload(client, proj, "house_a_L1_arch.dxf", "architecture")
    plumb = upload(client, proj, "house_a_L1_plumbing.dxf", "plumbing")
    upload(client, proj, "house_a_L1_electrical.dxf", "electrical")

    # Review edits: rename a room, delete a pipe, trace a new run, fix a wall height.
    s = client.get(f"/api/sheets/{arch}", headers=h).json()
    living = next(r for r in s["plan"]["rooms"] if r["name"] == "LIVING")
    wall = s["plan"]["walls"][0]
    r = client.post(f"/api/sheets/{arch}/edits", headers=h, json={"ops": [
        {"op": "rename_room", "id": living["id"], "name": "Living room"},
        {"op": "update_wall", "id": wall["id"], "height": 2.5}]})
    assert r.status_code == 200 and r.json()["corrections"] == {"added": 0, "deleted": 0, "edited": 2}
    p = client.get(f"/api/sheets/{plumb}", headers=h).json()
    victim = p["plan"]["pipes"][0]["id"]
    r = client.post(f"/api/sheets/{plumb}/edits", headers=h, json={"ops": [
        {"op": "delete", "kind": "pipe", "id": victim},
        {"op": "add_pipe", "system": "cold", "points": [[1, 1], [1, 3], [2, 3]]}]})
    assert r.json()["counts"]["pipe_segments"] == 19 - 1 + 2
    assert client.post(f"/api/sheets/{plumb}/edits", headers=h, json={"ops": [{"op": "nope"}]}).status_code == 422

    # Build → draft version, not live yet.
    r = client.post(f"/api/projects/{pid}/conversions", headers=h, json={"message": "Rev A"})
    job = r.json()
    assert job["status"] == "done", job
    vid = job["result"]["version_id"]
    rep = job["result"]["report"]
    assert rep["levels"]["Level 1"]["walls"] == 8 and rep["levels"]["Level 1"]["pipes"] == 20
    assert client.get(f"/api/projects/{pid}/elements", headers=h).json() == []
    els = client.get(f"/api/projects/{pid}/elements?version={vid}", headers=h).json()
    by_cls = {}
    for e in els:
        by_cls[e["ifc_class"]] = by_cls.get(e["ifc_class"], 0) + 1
    assert by_cls["IfcWall"] == 8 and by_cls["IfcDoor"] == 4 and by_cls["IfcWindow"] == 5
    assert by_cls["IfcPipeSegment"] == 20 and by_cls["IfcSanitaryTerminal"] == 4 and by_cls["IfcOutlet"] == 8
    traced = [e for e in els if e["source"] == "traced"]
    assert len(traced) == 2 and all(e["discipline"] == "plumbing" for e in traced)

    # Zones come from rooms, with names and polygons; MEP elements land in zones by containment.
    tree = client.get(f"/api/projects/{pid}/tree", headers=h).json()
    zones = {z["name"]: z for z in tree[0]["levels"][0]["zones"]}
    assert set(zones) == {"LIVING ROOM", "BEDROOM 1", "KITCHEN", "BATH", "BEDROOM 2"}
    toilet = next(e for e in els if e["ifc_class"] == "IfcSanitaryTerminal" and e["name"] == "Toilet")
    assert toilet["zone_id"] == zones["BATH"]["id"]
    sink_pipes = [e for e in els if e["ifc_class"] == "IfcPipeSegment" and e["zone_id"] == zones["KITCHEN"]["id"]]
    assert len(sink_pipes) >= 4

    # Approve → live. Rebuild keeps element identity (stable GUIDs) and progress.
    assert client.post(f"/api/models/{vid}/approve", json={}, headers=h).status_code == 200
    ids1 = {e["ifc_guid"]: e["id"] for e in client.get(f"/api/projects/{pid}/elements", headers=h).json()}
    vid2 = client.post(f"/api/projects/{pid}/conversions", headers=h, json={}).json()["result"]["version_id"]
    ids2 = {e["ifc_guid"]: e["id"] for e in client.get(f"/api/projects/{pid}/elements?version={vid2}", headers=h).json()}
    assert ids1 == ids2

    # All of it is in the history.
    types = {e["type"] for e in client.get(f"/api/projects/{pid}/events?limit=200", headers=h).json()}
    assert {"sheet.uploaded", "sheet.detected", "sheet.edited", "conversion.started", "model.version_created",
            "model.approved"} <= types


def test_scale_confirmation_reruns_detection(client, proj):
    h = proj["h"]
    sid = upload(client, proj, "duplex_L1_arch.dxf", "architecture")
    r = client.patch(f"/api/sheets/{sid}", headers=h, json={"unit_m": 0.002})  # wrong on purpose: 2x bigger
    assert r.status_code == 200
    s = client.get(f"/api/sheets/{sid}", headers=h).json()
    assert s["units_confirmed"] and s["unit_m"] == 0.002
    # Walls are now 2x as thick (0.4 m exterior) so fewer pairs fit; the point is detection re-ran at the new scale.
    assert s["plan"]["units"]["unit_m"] == 0.002


def test_reference_point_alignment(client, proj):
    h = proj["h"]
    sid = upload(client, proj, "house_a_L1_arch.dxf", "architecture")
    t = client.get(f"/api/sheets/{sid}", headers=h).json()["transform"]
    assert t["confirmed"] is False and t["dx"] == pytest.approx(0.0762, abs=0.01)  # outside corner -> origin
    r = client.patch(f"/api/sheets/{sid}", headers=h, json={"transform": {"reference": [1.0, 2.0]}})
    assert r.json()["transform"] == {"dx": -1.0, "dy": -2.0, "rotation_deg": 0.0, "reference": [1.0, 2.0],
                                     "confirmed": True}


def test_trade_sees_only_relevant_sheets(client, proj, api):
    h, pid = proj["h"], proj["pid"]
    upload(client, proj, "house_a_L1_arch.dxf", "architecture")
    upload(client, proj, "house_a_L1_plumbing.dxf", "plumbing")
    upload(client, proj, "house_a_L1_electrical.dxf", "electrical")
    ht = api.register("plumber@example.com")
    api.add_member(h, pid, "plumber@example.com", "trade", trades=["plumbing"])
    names = {s["discipline"] for s in client.get(f"/api/projects/{pid}/sheets", headers=ht).json()}
    assert names == {"architecture", "plumbing"}
    sid = client.get(f"/api/projects/{pid}/sheets", headers=ht).json()[0]["id"]
    assert client.post(f"/api/sheets/{sid}/edits", headers=ht, json={"ops": [{"op": "resolve", "id": "x"}]}).status_code == 403
