"""Import fidelity, model-linked pins, plans and real evidence-to-element projection."""
import io
import json

import ifcopenshell
import ifcopenshell.guid
import numpy as np
import trimesh
from sqlalchemy import select
from tests_helpers import jpeg

from app.bim.ifc_import import Item, SpaceInfo, _flat_props, _resolved_class, create_version
from app.bim.meshes import ifc_to_three, three_to_ifc
from app.disciplines import discipline_for
from app.models import ElementRevision, Project


def test_ifc2x3_specific_type_and_properties_are_not_truncated():
    f = ifcopenshell.file(schema="IFC2X3")
    product = f.create_entity("IfcFlowFitting", GlobalId=ifcopenshell.guid.new(), Name="Bedroom pipe elbow")
    typ = f.create_entity("IfcPipeFittingType", GlobalId=ifcopenshell.guid.new(), Name="25mm elbow")
    f.create_entity("IfcRelDefinesByType", GlobalId=ifcopenshell.guid.new(), RelatedObjects=[product], RelatingType=typ)
    properties = [f.create_entity("IfcPropertySingleValue", Name=f"Field-{i}", NominalValue=f.createIfcLabel(str(i)))
                  for i in range(85)]
    pset = f.create_entity("IfcPropertySet", GlobalId=ifcopenshell.guid.new(), Name="Details", HasProperties=properties)
    f.create_entity("IfcRelDefinesByProperties", GlobalId=ifcopenshell.guid.new(), RelatedObjects=[product], RelatingPropertyDefinition=pset)
    assert _resolved_class(product) == "IfcPipeFitting"
    assert discipline_for(_resolved_class(product)) == "plumbing"
    props = _flat_props(product)
    assert props["Details.Field-84"] == "84"
    assert props["IFC.type_name"] == "25mm elbow"


def test_duplicate_room_names_keep_distinct_codes_and_element_assignment(db, api):
    h = api.register("rooms@example.com")
    pid = api.project(h)
    items = [Item(guid=f"g-{i}", ifc_class="IfcPipeFitting", name=f"Elbow {i}", discipline="plumbing",
                  storey=("Building", "Level 2", 3.1),
                  verts=np.array([[x, 1, 3.2], [x + .03, 1, 3.2], [x, 1.03, 3.23]]), faces=np.array([[0, 1, 2]]))
             for i, x in enumerate([1, 6])]
    rooms = [SpaceInfo("Building", "Level 2", 3.1, "Bedroom 1", code,
                       [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4]]) for code, x in [("A202", 0), ("B202", 5)]]
    version = create_version(db, db.get(Project, pid), items, rooms, actor_id=None, source="ifc_import", message="test")
    db.flush()
    rows = list(db.scalars(select(ElementRevision).where(ElementRevision.version_id == version.id)))
    assert len({r.zone_id for r in rows}) == 2
    assert len(version.files["plans"]) == 1


def test_surface_pin_plan_and_photo_review_round_trip(client, api):
    h = api.register("model@example.com")
    pid = api.project(h)
    result = api.import_ifc(h, pid)
    version_id = result["version_id"]
    elements = client.get(f"/api/projects/{pid}/elements", headers=h).json()
    duct = next(e for e in elements if e["discipline"] == "hvac" and e["zone_id"])
    glb = client.get(f"/api/models/{version_id}/meshes/hvac.glb", headers=h).content
    scene = trimesh.load(io.BytesIO(glb), file_type="glb")
    _, geom = scene.graph.get(duct["id"])
    point = scene.geometry[geom].vertices[0].tolist()
    assert ifc_to_three(np.array([three_to_ifc(point)])).tolist()[0] == point
    issue = client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "Inspect this duct corner",
                        "element_id": duct["id"], "anchor": point, "model_version_id": version_id,
                        "viewpoint": {"position": [10, 5, 10], "target": point}})
    assert issue.status_code == 201, issue.text
    saved = client.get(f"/api/issues/{issue.json()['id']}", headers=h).json()
    assert saved["anchor"] == point and saved["model_version_id"] == version_id
    bad = client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "Wrong element location",
                      "element_id": duct["id"], "anchor": [10000, 10000, 10000], "model_version_id": version_id})
    assert bad.status_code == 422
    plan = client.get(f"/api/models/{version_id}/plans/{duct['level_id']}", headers=h).json()
    assert any(e["id"] == duct["id"] for e in plan["elements"])
    assert "not an approved" in plan["provenance"]
    upload = client.post(f"/api/projects/{pid}/uploads", headers=h,
                         data={"zone_id": duct["zone_id"], "trade": "hvac", "client_uuid": "bim-roundtrip",
                               "element_ids": json.dumps([duct["id"]]), "note": "Test photo; manual review"},
                         files=[("files", ("test.jpg", jpeg(19), "image/jpeg"))])
    assert upload.status_code == 201, upload.text
    verification = upload.json()["verifications"][0]
    before = client.get(f"/api/elements/{duct['id']}", headers=h).json()
    assert before["status"] == "needs_review" and before["completion_basis"] is None
    assert client.post(f"/api/verifications/{verification['id']}/approve", headers=h, json={}).status_code == 200
    after = client.get(f"/api/elements/{duct['id']}", headers=h).json()
    assert after["status"] == "done" and after["completion_basis"] == "human"
    assert after["open_issues"] == 1  # Red wins over completion until issue resolution.
    assert client.get(f"/api/models/{version_id}/meshes/hvac.glb", headers=h).content == glb
    assert after["history"][0]["evidence_ids"]  # Progress retains photo provenance, never changes geometry.
    later = api.import_ifc(h, pid)
    assert later["version_id"] != version_id
    reopened = client.get(f"/api/issues/{issue.json()['id']}", headers=h).json()
    assert reopened["model_version_id"] == version_id and reopened["anchor"] == point


def test_model_plan_respects_trade_layer_scope(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    version = api.import_ifc(h, pid)
    ht = api.register("hvac@example.com")
    api.add_member(h, pid, "hvac@example.com", "trade", trades=["hvac"])
    element = next(e for e in client.get(f"/api/projects/{pid}/elements", headers=h).json() if e["discipline"] == "hvac")
    plan = client.get(f"/api/models/{version['version_id']}/plans/{element['level_id']}", headers=ht).json()
    assert {e["discipline"] for e in plan["elements"]} <= {"hvac", "architecture"}
