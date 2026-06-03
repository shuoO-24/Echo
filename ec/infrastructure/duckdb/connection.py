from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import duckdb

from ec.config import SETTINGS
from ec.infrastructure.duckdb.schema import SCHEMA_SQL


def ensure_app_dir() -> Path:
    SETTINGS.app_dir.mkdir(parents=True, exist_ok=True)
    return SETTINGS.app_dir


@contextmanager
def connect() -> Iterator[duckdb.DuckDBPyConnection]:
    ensure_app_dir()
    conn = duckdb.connect(str(SETTINGS.db_path))
    try:
        conn.execute(SCHEMA_SQL)
        yield conn
    finally:
        conn.close()


@contextmanager
def connect_readonly() -> Iterator[duckdb.DuckDBPyConnection]:
    """Deprecated: use connect(). DuckDB rejects mixed read_only configs on one file."""
    with connect() as conn:
        yield conn
