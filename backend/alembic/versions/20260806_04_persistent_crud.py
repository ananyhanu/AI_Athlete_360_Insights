"""Add persistent user metadata and queryable athlete and assessment columns."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260806_04"
down_revision = "20260805_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Preserve encrypted records while adding relational and reporting metadata."""
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", new_column_name="hashed_password")
        batch.add_column(sa.Column("username", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET username = email WHERE username IS NULL")
    with op.batch_alter_table("users") as batch:
        batch.alter_column("username", nullable=False)
        batch.create_index("ix_users_username", ["username"], unique=True)

    with op.batch_alter_table("athletes") as batch:
        batch.add_column(sa.Column("full_name", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("date_of_birth", sa.String(length=10), nullable=True))
        batch.add_column(sa.Column("gender", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("sport", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("discipline", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("height_cm", sa.Float(), nullable=True))
        batch.add_column(sa.Column("weight_kg", sa.Float(), nullable=True))

    with op.batch_alter_table("assessment_attempts") as batch:
        batch.add_column(sa.Column("test_id", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("measurement_value", sa.Float(), nullable=True))
        batch.add_column(sa.Column("measurement_unit", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("score", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("review_status", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("performed_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_assessment_attempts_test_id", ["test_id"], unique=False)
        batch.create_foreign_key(
            "fk_assessment_attempts_athlete_id",
            "athletes",
            ["athlete_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    """Remove the persistence metadata added by this revision."""
    with op.batch_alter_table("assessment_attempts") as batch:
        batch.drop_constraint("fk_assessment_attempts_athlete_id", type_="foreignkey")
        batch.drop_index("ix_assessment_attempts_test_id")
        batch.drop_column("performed_at")
        batch.drop_column("review_status")
        batch.drop_column("score")
        batch.drop_column("measurement_unit")
        batch.drop_column("measurement_value")
        batch.drop_column("test_id")

    with op.batch_alter_table("athletes") as batch:
        batch.drop_column("weight_kg")
        batch.drop_column("height_cm")
        batch.drop_column("discipline")
        batch.drop_column("sport")
        batch.drop_column("gender")
        batch.drop_column("date_of_birth")
        batch.drop_column("full_name")

    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_username")
        batch.drop_column("last_login")
        batch.drop_column("username")
        batch.alter_column("hashed_password", new_column_name="password_hash")
