from typing import AsyncGenerator
import pathlib

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _ensure_db_dir(db_url: str) -> None:
    """Ensure the parent directory of a SQLite database exists."""
    if db_url.startswith("sqlite+aiosqlite:///"):
        db_path = db_url[len("sqlite+aiosqlite:///"):]
        try:
            pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError):
            # If we can't create the directory (e.g. /data not writable),
            # try falling back to local ./data or just let the error surface
            # at runtime rather than crashing import time.
            pass


_ensure_db_dir(settings.DATABASE_URL)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all tables. In production use Alembic migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)