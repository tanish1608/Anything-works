"""Shared daily work, immutable submission receipts and authenticated review.

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("work_packages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("element_id", sa.String(36), sa.ForeignKey("elements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.String(36), sa.ForeignKey("model_versions.id"), nullable=False),
        sa.Column("assignee_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("issue_id", sa.String(36), sa.ForeignKey("issues.id")),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "element_id"))
    for field in ("project_id", "element_id", "version_id", "assignee_id", "issue_id"):
        op.create_index(f"ix_work_packages_{field}", "work_packages", [field])
    op.create_table("work_submissions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("work_id", sa.String(36), sa.ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("upload_id", sa.String(36), sa.ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("reference", sa.JSON(), nullable=False),
        sa.Column("claim", sa.String(100), nullable=False))
    op.create_index("ix_work_submissions_work_id", "work_submissions", ["work_id"])


def downgrade():
    op.drop_table("work_submissions")
    op.drop_table("work_packages")
