"""Add verified contact state and authentication challenges."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260805_03"
down_revision = "20260318_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add verified contact fields and the hashed single-use authentication challenge table."""
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("mobile_number", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("mobile_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_unique_constraint("uq_users_mobile_number", ["mobile_number"])
        batch.create_index("ix_users_mobile_number", ["mobile_number"], unique=False)
    # Preserve access for legacy users created before the verification state was introduced.
    op.execute("UPDATE users SET email_verified = 1")

    op.create_table(
        "auth_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("secret_hash", sa.String(length=64), nullable=False),
        sa.Column("target", sa.String(length=254), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_challenges_expires_at", "auth_challenges", ["expires_at"], unique=False)
    op.create_index("ix_auth_challenges_purpose", "auth_challenges", ["purpose"], unique=False)
    op.create_index("ix_auth_challenges_secret_hash", "auth_challenges", ["secret_hash"], unique=False)
    op.create_index("ix_auth_challenges_user_id", "auth_challenges", ["user_id"], unique=False)


def downgrade() -> None:
    """Remove verification state and challenge storage, reversing the auth-schema extension."""
    op.drop_index("ix_auth_challenges_user_id", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_secret_hash", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_purpose", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_expires_at", table_name="auth_challenges")
    op.drop_table("auth_challenges")
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_mobile_number")
        batch.drop_constraint("uq_users_mobile_number", type_="unique")
        batch.drop_column("mobile_verified")
        batch.drop_column("mobile_number")
        batch.drop_column("email_verified")
