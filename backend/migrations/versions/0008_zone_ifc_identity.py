"""Preserve distinct IFC spaces even when display codes match."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("zones") as batch:
        batch.add_column(sa.Column("ifc_guid", sa.String(22), nullable=True))
        batch.create_index("ix_zones_ifc_guid", ["ifc_guid"])


def downgrade():
    with op.batch_alter_table("zones") as batch:
        batch.drop_index("ix_zones_ifc_guid")
        batch.drop_column("ifc_guid")
