"""Create encrypted athlete records and their idempotency keys."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260318_02"
down_revision = "20260318_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athletes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("athlete_id", sa.String(length=80), nullable=False),
        sa.Column("encrypted_payload", sa.Text(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("athlete_id"),
    )
    op.create_index("ix_athletes_athlete_id", "athletes", ["athlete_id"], unique=False)
    op.create_index("ix_athletes_owner_id", "athletes", ["owner_id"], unique=False)
    op.create_table(
        "athlete_idempotency_records",
        sa.Column("key", sa.String(length=256), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("athlete_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"]),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("athlete_idempotency_records")
    op.drop_index("ix_athletes_owner_id", table_name="athletes")
    op.drop_index("ix_athletes_athlete_id", table_name="athletes")
    op.drop_table("athletes")