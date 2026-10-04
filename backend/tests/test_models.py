import io

import trimesh
from sqlalchemy import select

from app.models import Element, ElementStatus


def _setup(api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    return h, pid


def test_import_creates_draft_version_levels_zones_and_elements(client, api):
    h, pid = _setup(api)
    res = api.import_ifc(h, pid, approve=False)
    assert res["number"] == 1
    st = res["stats"]
    assert st["by_discipline"]["architecture"] >= 8
    assert st["by_discipline"]["structure"] >= 6
    assert st["by_discipline"]["hvac"] == 3
    # Shared elements (chimney etc.) appear in several files but are imported once.
    els = client.get(f"/api/projects/{pid}/elements?version={res['version_id']}", headers=h).json()
    assert len({e["ifc_guid"] for e in els}) == len(els) == st["elements"]
    # Storey -> level, IfcSpace -> zone with polygon
    tree = client.get(f"/api/projects/{pid}/tree", headers=h).json()
    lv = tree[0]["levels"][0]
    assert lv["name"] == "00 groundfloor"
    assert {z["name"] for z in lv["zones"]} == {"living room", "entry hall"}
    assert all(len(z["polygon"]) >= 3 for z in lv["zones"])
    # Elements are assigned to zones by containment (the kitchen furniture sits in the living room)
    living = next(z for z in lv["zones"] if z["name"] == "living room")
    kitchen = next(e for e in els if e["name"] == "kitchen")
    assert kitchen["zone_id"] == living["id"]


def test_draft_not_live_until_approved(client, api):
    h, pid = _setup(api)
    res = api.import_ifc(h, pid, approve=False)
    assert client.get(f"/api/projects/{pid}/viewer", headers=h).json() == {"version": None, "layers": []}
    assert client.get(f"/api/projects/{pid}/elements", headers=h).json() == []
    api.register("v@example.com")
    api.add_member(h, pid, "v@example.com", "viewer")
    hv = {"Authorization": client.post("/api/auth/login", json={"email": "v@example.com", "password": "password123"})
          .json()["access_token"].join(["Bearer ", ""])}
    assert client.get(f"/api/projects/{pid}/viewer?version={res['version_id']}", headers=hv).status_code == 404
    assert client.post(f"/api/models/{res['version_id']}/approve", json={}, headers=hv).status_code == 403
    assert client.post(f"/api/models/{res['version_id']}/approve", json={}, headers=h).status_code == 200
    man = client.get(f"/api/projects/{pid}/viewer", headers=hv).json()
    assert man["version"]["number"] == 1 and man["version"]["is_current"]
    assert {layer["discipline"] for layer in man["layers"]} >= {"architecture", "structure", "hvac"}
    assert client.post(f"/api/models/{res['version_id']}/approve", json={}, headers=h).status_code == 409


def test_glb_nodes_are_element_ids(client, api):
    h, pid = _setup(api)
    api.import_ifc(h, pid)
    man = client.get(f"/api/projects/{pid}/viewer", headers=h).json()
    layer = next(x for x in man["layers"] if x["discipline"] == "hvac")
    r = client.get(layer["url"], headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "model/gltf-binary"
    scene = trimesh.load(io.BytesIO(r.content), file_type="glb")
    ids = {e["id"] for e in client.get(f"/api/projects/{pid}/elements", headers=h).json() if e["discipline"] == "hvac"}
    assert set(scene.graph.nodes_geometry) == ids
    # Y-up: the duct runs vertically up the chimney, so its Y extent is large.
    lo, hi = scene.bounds
    assert hi[1] - lo[1] > 3


def test_trade_sees_own_layer_plus_context(client, api):
    h, pid = _setup(api)
    api.import_ifc(h, pid)
    ht = api.register("hvac@example.com")
    api.add_member(h, pid, "hvac@example.com", "trade", trades=["hvac"])
    man = client.get(f"/api/projects/{pid}/viewer", headers=ht).json()
    assert {(x["discipline"], x["context"]) for x in man["layers"]} == {("hvac", False), ("architecture", True)}
    struct_url = man["layers"][0]["url"].rsplit("/", 1)[0] + "/structure.glb"
    assert client.get(struct_url, headers=ht).status_code == 404
    els = client.get(f"/api/projects/{pid}/elements", headers=ht).json()
    assert {e["discipline"] for e in els} == {"hvac", "architecture"}
    assert all(e["context"] == (e["discipline"] == "architecture") for e in els)


def test_reimport_keeps_identity_and_progress(client, api, db):
    h, pid = _setup(api)
    v1 = api.import_ifc(h, pid)
    els1 = {e["ifc_guid"]: e["id"] for e in client.get(f"/api/projects/{pid}/elements", headers=h).json()}
    el = db.scalar(select(Element).where(Element.project_id == pid))
    el.status = ElementStatus.done
    db.commit()
    v2 = api.import_ifc(h, pid)
    assert v2["number"] == 2
    els2 = {e["ifc_guid"]: e["id"] for e in client.get(f"/api/projects/{pid}/elements", headers=h).json()}
    assert els1 == els2  # stable ids across versions
    db.expire_all()
    assert db.get(Element, el.id).status == ElementStatus.done  # unchanged geometry keeps progress
    versions = client.get(f"/api/projects/{pid}/models", headers=h).json()
    assert [v["number"] for v in versions] == [2, 1] and versions[0]["is_current"]
    assert versions[0]["parent_id"] == v1["version_id"]


def test_element_detail_and_history(client, api):
    h, pid = _setup(api)
    api.import_ifc(h, pid)
    el = next(e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json() if e["ifc_class"] == "IfcBeam")
    d = client.get(f"/api/elements/{el['id']}", headers=h).json()
    assert d["discipline"] == "structure" and d["trade"] == "framing" and d["status"] == "not_started"
    assert isinstance(d["props"], dict) and isinstance(d["history"], list)


def test_rejects_non_ifc(client, api):
    h, pid = _setup(api)
    r = client.post(f"/api/projects/{pid}/models/import", files=[("files", ("x.ifc", b"hello", "text/plain"))],
                    headers=h)
    assert r.status_code == 422
    r = client.post(f"/api/projects/{pid}/models/import", files=[("files", ("x.dwg", b"hello", "text/plain"))],
                    headers=h)
    assert r.status_code == 422


def test_trade_cannot_upload(client, api):
    h, pid = _setup(api)
    ht = api.register("t@example.com")
    api.add_member(h, pid, "t@example.com", "trade", trades=["plumbing"])
    r = client.post(f"/api/projects/{pid}/models/import", files=[("files", ("x.ifc", b"ISO-10303-21;", "x"))],
                    headers=ht)
    assert r.status_code == 403
