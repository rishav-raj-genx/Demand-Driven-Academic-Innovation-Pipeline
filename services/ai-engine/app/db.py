from contextlib import contextmanager
from typing import Generator
import psycopg
from psycopg_pool import ConnectionPool
from pgvector.psycopg import register_vector
from app.config import get_settings

_pool: ConnectionPool | None = None


def configure_connection(conn: psycopg.Connection) -> None:
    """
    Configures a connection checking out of the pool with pgvector type handlers.
    """
    register_vector(conn)


def get_db_pool() -> ConnectionPool:
    """
    Returns the singleton psycopg ConnectionPool.
    Initializes the pool if not already initialized.
    """
    global _pool
    if _pool is None:
        settings = get_settings()
        # Clean postgresql query parameters (like ?schema=public) for raw libpq connection
        conninfo = settings.DATABASE_URL.split("?")[0]
        _pool = ConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=10,
            open=True,
            configure=configure_connection,
        )
    return _pool


def close_db_pool() -> None:
    """
    Closes the singleton psycopg ConnectionPool.
    """
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_db_connection() -> Generator[psycopg.Connection, None, None]:
    """
    Context manager yielding a registered psycopg connection from the pool.
    """
    pool = get_db_pool()
    with pool.connection() as conn:
        yield conn


def get_db() -> Generator[psycopg.Connection, None, None]:
    """
    FastAPI dependency yielding a registered psycopg connection.
    """
    with get_db_connection() as conn:
        yield conn
