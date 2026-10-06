from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, create_engine, inspect, select, text
from sqlalchemy.orm import Session

from app.models import User


def test_upgrade_preserves_existing_users_and_agent_migration_round_trip(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "migrations"))
    url = f"sqlite:///{tmp_path}/migrations.db"
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "0007")
    engine = create_engine(url)
    with Session(engine) as db:
        user = User(email="existing@example.com", name="Existing user", password_hash="explicit-test-fixture")
        db.add(user)
        db.commit()
    command.upgrade(config, "head")
    tables = {"agent_runs", "agent_actions", "agent_references", "agent_requests"}
    assert tables <= set(inspect(engine).get_table_names())
    with Session(engine) as db:
        assert db.scalar(select(User.name).where(User.email == "existing@example.com")) == "Existing user"
    command.check(config)
    command.downgrade(config, "0007")
    assert not tables.intersection(inspect(engine).get_table_names())
    command.upgrade(config, "head")
    assert tables <= set(inspect(engine).get_table_names())
    command.check(config)
    engine.dispose()


@pytest.mark.parametrize("baseline", ["main_0008", "agent_0008", "agent_0009"])
def test_reconciliation_preserves_both_previously_published_0008_schemas(tmp_path, baseline):
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "migrations"))
    url = f"sqlite:///{tmp_path}/reconcile.db"
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "0007" if baseline == "main_0008" else baseline.removeprefix("agent_"))
    engine = create_engine(url)
    with engine.begin() as connection:
        if baseline == "main_0008":
            connection.execute(text("ALTER TABLE zones ADD COLUMN ifc_guid VARCHAR(22)"))
            connection.execute(text("CREATE INDEX ix_zones_ifc_guid ON zones (ifc_guid)"))
        metadata = MetaData()
        now = datetime.now(UTC)
        rows = [
            ("organizations", {"id": "org", "name": "Retained organization", "created_at": now}),
            ("projects", {"id": "project", "org_id": "org", "name": "Retained project", "settings": {}, "created_at": now}),
            ("buildings", {"id": "building", "project_id": "project", "name": "Retained building", "created_at": now}),
            ("levels", {"id": "level", "building_id": "building", "name": "Retained level", "index": 1, "elevation_m": 0, "height_m": 3, "created_at": now}),
            ("zones", {"id": "zone", "level_id": "level", "name": "Retained room", "kind": "room", "qr_token": "retained-qr", "created_at": now,
                       **({"ifc_guid": "existing-ifc-identity"} if baseline == "main_0008" else {})}),
        ]
        for name, values in rows:
            connection.execute(Table(name, metadata, autoload_with=connection).insert().values(**values))
    with Session(engine) as db:
        db.add(User(email="retained@example.com", name="Retained person", password_hash="explicit-test-fixture"))
        db.commit()
    if baseline == "main_0008":
        command.stamp(config, "0008")
    command.upgrade(config, "head")
    command.check(config)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM zones WHERE id = 'zone'")).scalar_one() == "Retained room"
        guid = connection.execute(text("SELECT ifc_guid FROM zones WHERE id = 'zone'")).scalar_one()
        assert guid == ("existing-ifc-identity" if baseline == "main_0008" else None)
        assert connection.execute(text("SELECT name FROM users WHERE email = 'retained@example.com'")).scalar_one() == "Retained person"
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0010"
    if baseline == "main_0008":
        with pytest.raises(RuntimeError, match="IFC zone identities would be discarded"):
            command.downgrade(config, "0009")
        with engine.connect() as connection:
            assert connection.execute(text("SELECT ifc_guid FROM zones WHERE id = 'zone'")).scalar_one() == "existing-ifc-identity"
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0010"
    engine.dispose()
