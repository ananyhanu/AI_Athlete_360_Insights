"""One-time command for creating or resetting a verified national administrator account."""

import json
import os
import sys

from sqlalchemy import select

from .config import Settings
from .database import Database, commit_transaction
from .models import User
from .security import hash_password


def main() -> None:
    """Read bootstrap credentials, upsert the admin account, and close all resources."""
    settings = Settings()
    settings.validate_secrets()
    email = os.environ.get("AA360_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("AA360_BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or len(password) < 12:
        sys.exit("Set AA360_BOOTSTRAP_ADMIN_EMAIL and a 12+ character AA360_BOOTSTRAP_ADMIN_PASSWORD.")

    database = Database(settings.database_url)
    database.create_schema()
    session = database.session()
    try:
        user = session.scalar(select(User).where(User.email == email))
        if user:
            # A rerun resets only the admin's credential and privileges, keeping its stable user ID.
            user.password_hash = hash_password(password)
            user.roles_json = json.dumps(["national-admin"])
            user.is_active = True
            user.email_verified = True
        else:
            # New bootstrap users are verified because an operator supplied credentials directly.
            session.add(User(
                email=email,
                email_verified=True,
                password_hash=hash_password(password),
                roles_json=json.dumps(["national-admin"]),
            ))
        commit_transaction(session)
    finally:
        session.close()


if __name__ == "__main__":
    # Permit `python -m app.bootstrap` without executing account setup on normal imports.
    main()