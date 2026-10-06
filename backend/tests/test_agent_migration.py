from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
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
