"""Review-only AI check runs over received work submissions.

Revision ID: 0010
Revises: 0009
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("work_assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_id", sa.String(36), sa.ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("upload_id", sa.String(36), sa.ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("upload_id", "input_hash"))
    for field in ("project_id", "work_id", "upload_id", "status"):
        op.create_index(f"ix_work_assessments_{field}", "work_assessments", [field])


def downgrade():
    op.drop_table("work_assessments")
