"""Reconcile the two previously published meanings of revision 0008.

Existing databases may have agent tables or IFC zone identity at 0008.
Keep the applied revision IDs and add the missing schema without restamping.
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

AGENT_TABLES = {"agent_references", "agent_runs", "agent_actions", "agent_requests"}


def upgrade():
    inspector = sa.inspect(op.get_bind())
    present = AGENT_TABLES.intersection(inspector.get_table_names())
    if present and present != AGENT_TABLES:
        raise RuntimeError("Incomplete agent schema; restore or repair it before upgrading")
    if not present:
        # Main's old 0008 stamp skipped the agent migration with the same ID.
        spec = spec_from_file_location("agent_schema_0008", Path(__file__).with_name("0008_add_scoped_agent_assessments.py"))
        migration = module_from_spec(spec)
        spec.loader.exec_module(migration)
        migration.upgrade()
    columns = {column["name"] for column in inspector.get_columns("zones")}
    indexes = {index["name"] for index in inspector.get_indexes("zones")}
    with op.batch_alter_table("zones") as batch:
        if "ifc_guid" not in columns:
            batch.add_column(sa.Column("ifc_guid", sa.String(22), nullable=True))
        if "ix_zones_ifc_guid" not in indexes:
            batch.create_index("ix_zones_ifc_guid", ["ifc_guid"])


def downgrade():
    if op.get_bind().execute(sa.text("SELECT 1 FROM zones WHERE ifc_guid IS NOT NULL LIMIT 1")).first():
        raise RuntimeError("Cannot downgrade: retained IFC zone identities would be discarded")
    with op.batch_alter_table("zones") as batch:
        batch.drop_index("ix_zones_ifc_guid")
        batch.drop_column("ifc_guid")
