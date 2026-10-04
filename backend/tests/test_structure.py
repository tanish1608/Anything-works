def test_structure_crud(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    s = api.structure(h, pid)
    tree = client.get(f"/api/projects/{pid}/tree", headers=h).json()
    assert tree[0]["name"] == "Building A"
    assert tree[0]["levels"][0]["name"] == "Level 3"
    assert {z["name"] for z in tree[0]["levels"][0]["zones"]} == {"Unit 304, Bedroom 2", "Unit 305, Kitchen"}

    r = client.patch(f"/api/zones/{s['z1']}", json={"name": "Unit 304, Master Bedroom",
                                                    "polygon": [[0, 0], [4, 0], [4, 3], [0, 3]]}, headers=h)
    assert r.status_code == 200 and r.json()["polygon"][2] == [4, 3]
    assert client.patch(f"/api/levels/{s['level']}", json={"height_m": -1}, headers=h).status_code == 422

    assert client.delete(f"/api/buildings/{s['building']}", headers=h).status_code == 204
    assert client.get(f"/api/projects/{pid}/tree", headers=h).json() == []
    assert client.get(f"/api/zones/{s['z1']}", headers=h).status_code == 404  # cascaded


def test_zone_qr_tokens_are_unique(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    s = api.structure(h, pid)
    t1 = client.get(f"/api/zones/{s['z1']}", headers=h).json()["qr_token"]
    t2 = client.get(f"/api/zones/{s['z2']}", headers=h).json()["qr_token"]
    assert t1 != t2 and len(t1) >= 16


def test_projects_list_shows_my_role(client, api):
    owner = api.register("o@example.com")
    pid = api.project(owner, "Cedar Row")
    viewer = api.register("v@example.com")
    api.add_member(owner, pid, "v@example.com", "viewer")
    rows = client.get("/api/projects", headers=viewer).json()
    assert [(r["name"], r["my_role"]) for r in rows] == [("Cedar Row", "viewer")]
    assert client.get("/api/projects", headers=api.register("z@example.com")).json() == []
