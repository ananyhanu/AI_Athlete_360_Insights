"""SQLAlchemy engine, session, and declarative-model setup."""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Common SQLAlchemy metadata base for every persisted backend model."""

    pass


class Database:
    """Own the database engine and provide short-lived unit-of-work sessions."""

    def __init__(self, database_url: str):
        """Create an engine, adding SQLite's required same-thread override when applicable."""
        # SQLite needs this setting because the test client may access its connection from another thread.
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
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
    finally:
        session.close()