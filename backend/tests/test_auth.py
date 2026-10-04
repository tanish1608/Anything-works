def test_register_login_me(client, api):
    h = api.register("pm@example.com", "Pat PM")
    assert client.get("/api/auth/me", headers=h).json()["email"] == "pm@example.com"
    r = client.post("/api/auth/login", json={"email": "PM@example.com", "password": "password123"})
    assert r.status_code == 200


def test_duplicate_email_rejected(client, api):
    api.register("a@example.com")
    r = client.post("/api/auth/register", json={"email": "a@example.com", "name": "x", "password": "password123"})
    assert r.status_code == 409


def test_bad_password(client, api):
    api.register("a@example.com")
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert r.status_code == 401


def test_requires_token(client):
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/projects", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "name": "a", "password": "password123"})
    rt = r.json()["refresh_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {rt}"}).status_code == 401


def test_refresh_rotation_and_reuse_detection(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "name": "a", "password": "password123"})
    rt1 = r.json()["refresh_token"]
    r2 = client.post("/api/auth/refresh", json={"refresh_token": rt1})
    assert r2.status_code == 200
    rt2 = r2.json()["refresh_token"]
    # Re-using the old token is rejected and kills the whole family, including rt2.
    assert client.post("/api/auth/refresh", json={"refresh_token": rt1}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": rt2}).status_code == 401


def test_logout_revokes_refresh(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "name": "a", "password": "password123"})
    rt = r.json()["refresh_token"]
    assert client.post("/api/auth/logout", json={"refresh_token": rt}).status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": rt}).status_code == 401
