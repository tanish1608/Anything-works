from sqlalchemy import func, select

from app.models import ModelVersion, Project, ProjectMember
from app.seed import seed, seed_sample_ifc


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo-password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_seed_converts_duplex_and_scopes_plumber(db, client):
    p1 = seed(db)
    assert seed(db).id == p1.id
    assert db.scalar(select(func.count()).select_from(Project)) == 1
    assert db.scalar(select(func.count()).select_from(ProjectMember)) == 5
    v = db.get(ModelVersion, p1.current_version_id)
    assert v.source == "conversion" and v.status == "approved"
    pm, plumber = _login(client, "pm@example.com"), _login(client, "plumber@example.com")
    zones = [z["name"] for b in client.get(f"/api/projects/{p1.id}/tree", headers=pm).json()
             for lv in b["levels"] for z in lv["zones"]]
    assert len(zones) == 12 and "UNIT 201 BATH" in zones
    mine = [z["name"] for b in client.get(f"/api/projects/{p1.id}/tree", headers=plumber).json()
            for lv in b["levels"] for z in lv["zones"]]
    assert len(mine) == 8 and not any("BEDROOM" in n for n in mine)
    els = client.get(f"/api/projects/{p1.id}/elements", headers=plumber).json()
    pipes = [e for e in els if e["ifc_class"] == "IfcPipeSegment"]
    assert pipes and all(not e["context"] for e in pipes)
    assert {e["discipline"] for e in els} == {"plumbing", "architecture"}


def test_seed_sample_ifc(db, client):
    p = seed_sample_ifc(db)
    assert p is not None and p.current_version_id
    assert seed_sample_ifc(db).id == p.id
