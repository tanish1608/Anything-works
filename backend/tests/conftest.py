import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-use-0123456789")
os.environ.setdefault("BCRYPT_ROUNDS", "4")
os.environ["JOBS_MODE"] = "inline"
# Never call the real vision API from tests, even when backend/.env has a key; vision tests opt in with a fake client.
os.environ["VISION_MODE"] = "off"

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, bind_engine, get_db, make_engine
from app.main import app
from app.models import install_event_guards

# Set TEST_DATABASE_URL=postgresql+psycopg://... to run the suite against Postgres (CI does both).
PG_URL = os.environ.get("TEST_DATABASE_URL")


SAMPLES = Path(__file__).resolve().parents[2] / "samples"


@pytest.fixture(autouse=True)
def _storage(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "storage_dir", str(tmp_path / "storage"))


@pytest.fixture
def engine(tmp_path):
    if PG_URL:
        eng = make_engine(PG_URL)
        with eng.begin() as c:
            c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    else:
        eng = make_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(eng)
    with eng.begin() as c:
        install_event_guards(c)
    bind_engine(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


@pytest.fixture
def client(engine):
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def _get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class Api:
    """Small helper so tests read like user stories."""

    def __init__(self, client: TestClient):
        self.c = client

    def register(self, email: str, name: str | None = None, password: str = "password123") -> dict:
        r = self.c.post("/api/auth/register", json={"email": email, "name": name or email.split("@")[0],
                                                    "password": password})
        assert r.status_code == 201, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def project(self, h, name="Maple Court") -> str:
        r = self.c.post("/api/projects", json={"name": name}, headers=h)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def add_member(self, h, pid, email, role, **kw):
        return self.c.post(f"/api/projects/{pid}/members", json={"email": email, "role": role, **kw}, headers=h)

    def structure(self, h, pid) -> dict:
        """One building, one level, two zones."""
        b = self.c.post(f"/api/projects/{pid}/buildings", json={"name": "Building A"}, headers=h).json()
        lv = self.c.post(f"/api/buildings/{b['id']}/levels", json={"name": "Level 3", "index": 3}, headers=h).json()
        z1 = self.c.post(f"/api/levels/{lv['id']}/zones", json={"name": "Unit 304, Bedroom 2"}, headers=h).json()
        z2 = self.c.post(f"/api/levels/{lv['id']}/zones", json={"name": "Unit 305, Kitchen"}, headers=h).json()
        return {"building": b["id"], "level": lv["id"], "z1": z1["id"], "z2": z2["id"]}


    def import_ifc(self, h, pid, names=("Building-Architecture.ifc", "Building-Structural.ifc",
                                        "Building-Hvac.ifc"), approve=True) -> dict:
        files = [("files", (n, (SAMPLES / "ifc" / n).read_bytes(), "application/octet-stream")) for n in names]
        r = self.c.post(f"/api/projects/{pid}/models/import", files=files, data={"message": "initial"}, headers=h)
        assert r.status_code == 202, r.text
        job = r.json()
        assert job["status"] == "done", job
        vid = job["result"]["version_id"]
        if approve:
            assert self.c.post(f"/api/models/{vid}/approve", json={}, headers=h).status_code == 200
        return job["result"]


@pytest.fixture
def api(client) -> Api:
    return Api(client)
