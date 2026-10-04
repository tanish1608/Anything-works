from sqlalchemy import func, select

from app.models import Project, ProjectMember
from app.seed import seed, seed_sample_ifc


def test_seed_is_idempotent_and_usable(db, client):
    p1 = seed(db)
    p2 = seed(db)
    assert p1.id == p2.id
    assert db.scalar(select(func.count()).select_from(Project)) == 1
    assert db.scalar(select(func.count()).select_from(ProjectMember)) == 5
    r = client.post("/api/auth/login", json={"email": "plumber@example.com", "password": "demo-password"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    tree = client.get(f"/api/projects/{p1.id}/tree", headers=h).json()
    names = [z["name"] for b in tree for lv in b["levels"] for z in lv["zones"]]
    assert names and all("Bedroom" not in n for n in names)


def test_seed_sample_ifc(db, client):
    p = seed_sample_ifc(db)
    assert p is not None and p.current_version_id
    assert seed_sample_ifc(db).id == p.id
