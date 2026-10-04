"""Migrations must build the same schema as the models, including the append-only guards."""

import os

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app.db import Base

HERE = os.path.dirname(os.path.dirname(__file__))


@pytest.mark.skipif(bool(os.environ.get("TEST_DATABASE_URL")), reason="sqlite-only check")
def test_migrations_match_models(tmp_path):
    url = f"sqlite:///{tmp_path}/mig.db"
    cfg = Config(os.path.join(HERE, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(HERE, "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    eng = create_engine(url)
    with eng.connect() as c:
        diff = compare_metadata(MigrationContext.configure(c), Base.metadata)
        assert diff == [], diff
        assert {"events_no_update", "events_no_delete"} <= {
            r[0] for r in c.execute(text("select name from sqlite_master where type='trigger'"))
        }
    assert "zones" in inspect(eng).get_table_names()
