from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, database_url: str):
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def create_schema(self) -> None:
        Base.metadata.create_all(bind=self.engine)

    def session(self) -> Session:
        return self.session_factory()


def get_db_session(database: Database) -> Generator[Session, None, None]:
    session = database.session()
    try:
        yield session
    finally:
        session.close()