"""SQLAlchemy async engine, session factory, and declarative base.

Provides the database infrastructure for the application. Uses async
SQLAlchemy with asyncpg driver for PostgreSQL.
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# Async engine — pool settings tuned for local dev
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=5,
    max_overflow=10,
)

# Session factory — used as a dependency in route handlers
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async database session.

    Usage:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
