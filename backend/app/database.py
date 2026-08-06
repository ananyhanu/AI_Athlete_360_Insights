"""SQLAlchemy engine, session, and declarative-model setup."""

import logging
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Common SQLAlchemy metadata base for every persisted backend model."""

    pass


class Database:
    """Own the database engine and provide short-lived unit-of-work sessions."""

    def __init__(self, database_url: str):
        """Create an engine, adding SQLite's required same-thread override when applicable."""
        is_sqlite = database_url.startswith("sqlite")
        if is_sqlite:
            create_sqlite_parent_directory(database_url)
        # SQLite needs this setting because the test client may access its connection from another thread.
        connect_args = {"check_same_thread": False} if is_sqlite else {}
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        if is_sqlite:
            enable_sqlite_foreign_keys(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def create_schema(self) -> None:
        """Create all mapped tables for development and isolated test databases."""
        Base.metadata.create_all(bind=self.engine)

    def session(self) -> Session:
        """Open an uncommitted SQLAlchemy session for one request or command."""
        return self.session_factory()


def get_db_session(database: Database) -> Generator[Session, None, None]:
    """Yield a session and always close its database resources after the caller finishes."""
    session = database.session()
    try:
        yield session
    except Exception:
        session.rollback()
        logger.exception("Database transaction rolled back after an unhandled error.")
        raise
    finally:
        session.close()


def create_sqlite_parent_directory(database_url: str) -> None:
    """Create the parent directory for a file-backed SQLite URL when it is absent."""
    database_path = database_url.removeprefix("sqlite:///")
    if not database_path or database_path == ":memory:":
        return
    Path(database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """Enable SQLite foreign-key enforcement for every connection in this application."""
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def commit_transaction(session: Session, *instances: object) -> None:
    """Commit one unit of work, logging and rolling it back when the database rejects it."""
    try:
        session.commit()
        for instance in instances:
            session.refresh(instance)
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Database transaction could not be committed.")
        raise