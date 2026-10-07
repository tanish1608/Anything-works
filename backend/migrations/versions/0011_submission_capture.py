"""Phone capture metadata (LiDAR measurements, GPS, device) on work submissions.

Revision ID: 0011
Revises: 0010
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("work_submissions") as batch:
        batch.add_column(sa.Column("capture", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("work_submissions") as batch:
        batch.drop_column("capture")
