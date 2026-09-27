import aiosqlite
from contextlib import asynccontextmanager
from typing import Dict, Optional, Any, AsyncGenerator
from pathlib import Path
from app.config import settings


class DatabaseService:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or settings.database_path

    @asynccontextmanager
    async def get_connection(self) -> AsyncGenerator[aiosqlite.Connection, None]:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(str(self._db_path)) as conn:
            conn.row_factory = aiosqlite.Row
            yield conn

    async def init_db(self) -> None:
        async with self.get_connection() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS file_manifest (
                    path TEXT PRIMARY KEY,
                    hash TEXT NOT NULL,
                    mtime INTEGER NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            await conn.commit()

    async def get_all_manifest_records(self) -> Dict[str, Dict[str, Any]]:
        async with self.get_connection() as conn:
            async with conn.execute("SELECT path, hash, mtime FROM file_manifest") as cursor:
                rows = await cursor.fetchall()
                return {row["path"]: {"hash": row["hash"], "mtime": row["mtime"]} for row in rows}

    async def get_file_record(self, path: str) -> Optional[Dict[str, Any]]:
        async with self.get_connection() as conn:
            async with conn.execute(
                "SELECT path, hash, mtime FROM file_manifest WHERE path = ?", (path,)
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    return {"path": row["path"], "hash": row["hash"], "mtime": row["mtime"]}
                return None

    async def upsert_record(self, path: str, hash_val: str, mtime: int) -> None:
        async with self.get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO file_manifest (path, hash, mtime, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(path) DO UPDATE SET
                    hash = excluded.hash,
                    mtime = excluded.mtime,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (path, hash_val, mtime),
            )
            await conn.commit()

    async def remove_record(self, path: str) -> bool:
        async with self.get_connection() as conn:
            cursor = await conn.execute("DELETE FROM file_manifest WHERE path = ?", (path,))
            await conn.commit()
            return cursor.rowcount > 0


db_service = DatabaseService()
