"""Optional real-file acceptance: download the pinned apartment source before running.

The standard fixtures create a disposable database/storage; no normal project is touched.
"""
import hashlib
import io
import json
import time
from pathlib import Path

import numpy as np
import pytest
import trimesh
from tests_helpers import jpeg

from app.bim.meshes import ifc_to_three

SOURCE = Path(__file__).resolve().parents[2] / "samples/ifc/schependomlaan"
IFC = SOURCE / "IFC Schependomlaan.ifc"


@pytest.mark.skipif(not IFC.exists(), reason="Download the pinned Schependomlaan IFC to run the large-model upload acceptance.")
def test_real_apartment_upload_review_and_evidence_round_trip(api, client):
    manifest = json.loads((SOURCE / "source.json").read_text())
    content = IFC.read_bytes()
    assert hashlib.sha256(content).hexdigest() == manifest["files"][IFC.name]
    h = api.register("apartment-audit@example.com")
    pid = api.project(h, "Schependomlaan upload acceptance")
    start = time.monotonic()
    result = client.post(f"/api/projects/{pid}/models/import", headers=h,
                        files=[("files", (IFC.name, content, "application/octet-stream"))],
                        data={"message": "Pinned real apartment source — import acceptance"})
    assert result.status_code == 202, result.text
    job = result.json()
    assert job["status"] == "done", job
    stats = job["result"]["stats"]
    assert stats["elements"] == 3504
    assert stats["import_audit"][0]["source_spaces"] == 100
    assert stats["import_audit"][0]["imported_spaces"] == 100
    vid = job["result"]["version_id"]
    assert client.get(f"/api/projects/{pid}/viewer", headers=h).json()["version"] is None
    assert client.get(f"/api/projects/{pid}/viewer?version={vid}").status_code == 401
    assert client.post(f"/api/models/{vid}/approve", headers=h, json={"message": "Test reference review"}).status_code == 200
    tree = client.get(f"/api/projects/{pid}/tree", headers=h).json()
    levels = [lv for building in tree for lv in building["levels"]]
    assert len(levels) == 6
    # The source contains two same-name/code 1.02 spaces; current import yields 99 distinct zone identities.
    assert sum(len(lv["zones"]) for lv in levels) == 99
    elements = client.get(f"/api/projects/{pid}/elements", headers=h).json()
    assert len(elements) == 3504
    target = next(e for e in elements if e["ifc_class"] == "IfcDoor" and e["zone_id"])
    mesh = client.get(f"/api/models/{vid}/meshes/architecture.glb", headers=h)
    assert mesh.status_code == 200
    scene = trimesh.load(io.BytesIO(mesh.content), file_type="glb")
    assert set(scene.graph.nodes_geometry) == {e["id"] for e in elements if e["discipline"] == "architecture"}
    plan = client.get(f"/api/models/{vid}/plans/{target['level_id']}", headers=h).json()
    assert any(e["id"] == target["id"] for e in plan["elements"])
    assert len(plan["rooms"]) > 1
    bbox = target["bbox"]
    anchor = ifc_to_three(np.array([[(bbox[i] + bbox[i + 3]) / 2 for i in range(3)]]))[0].tolist()
    issue = client.post(f"/api/projects/{pid}/issues", headers=h, json={"title": "Test correction at source component",
                        "element_id": target["id"], "anchor": anchor, "model_version_id": vid})
    assert issue.status_code == 201, issue.text
    upload = client.post(f"/api/projects/{pid}/uploads", headers=h,
                         data={"zone_id": target["zone_id"], "trade": target["trade"], "client_uuid": "apartment-acceptance",
                               "element_ids": json.dumps([target["id"]]), "note": "Synthetic test evidence; manual review"},
                         files=[("files", ("test.jpg", jpeg(21), "image/jpeg"))])
    assert upload.status_code == 201, upload.text
    verification = upload.json()["verifications"][0]
    before = client.get(f"/api/elements/{target['id']}", headers=h).json()
    assert before["status"] == "needs_review" and before["completion_basis"] is None
    assert client.post(f"/api/verifications/{verification['id']}/approve", headers=h, json={}).status_code == 200
    after = client.get(f"/api/elements/{target['id']}", headers=h).json()
    assert after["status"] == "done" and after["completion_basis"] == "human"
    assert after["open_issues"] == 1
    assert after["history"][0]["evidence_ids"]
    assert client.get(f"/api/models/{vid}/meshes/architecture.glb", headers=h).content == mesh.content
    report = {"source_sha256": manifest["files"][IFC.name], "source_bytes": len(content),
              "elements": len(elements), "levels": len(levels), "spaces_read": 100, "distinct_zones": 99,
              "upload_draft_approval": "passed", "unauthenticated_access": "rejected",
              "plan_and_glb_identity": "passed", "photo_manual_review": "passed", "open_issue_preserved": True,
              "geometry_unchanged": True, "live_ai_called": False,
              "seconds": round(time.monotonic() - start, 3)}
    (SOURCE / "UPLOAD_TEST.json").write_text(json.dumps(report, indent=2) + "\n")
