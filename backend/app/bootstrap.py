import json
import os
import sys

from sqlalchemy import select

from .config import Settings
from .database import Database
from .models import User
from .security import hash_password


def main() -> None:
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
            user.password_hash = hash_password(password)
            user.roles_json = json.dumps(["national-admin"])
            user.is_active = True
        else:
            session.add(User(
                email=email,
                password_hash=hash_password(password),
                roles_json=json.dumps(["national-admin"]),
            ))
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    main()