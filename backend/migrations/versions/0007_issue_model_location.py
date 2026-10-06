"""Track the model revision in which an issue location was recorded."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("issues") as batch:
        batch.add_column(sa.Column("model_version_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_issue_model_version", "model_versions", ["model_version_id"], ["id"], ondelete="SET NULL")


def downgrade():
    with op.batch_alter_table("issues") as batch:
        batch.drop_constraint("fk_issue_model_version", type_="foreignkey")
        batch.drop_column("model_version_id")
