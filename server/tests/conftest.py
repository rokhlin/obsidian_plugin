import os
import shutil
import pytest
import pytest_asyncio
from pathlib import Path
from httpx import AsyncClient, ASGITransport

TEST_DIR = Path(__file__).resolve().parent / "tmp_test_data"
TEST_DIR.mkdir(parents=True, exist_ok=True)

os.environ["AUTH_TOKEN"] = "test-secret-token-123"
os.environ["VAULT_PATH"] = str(TEST_DIR / "vault")
os.environ["ARCHIVE_PATH"] = str(TEST_DIR / "archive")
os.environ["CONFLICTS_PATH"] = str(TEST_DIR / "conflicts")
os.environ["DB_PATH"] = str(TEST_DIR / "test_manifest.db")
os.environ["TEMP_DIR"] = str(TEST_DIR / "temp")

from app.main import app
from app.config import settings
from app.services.db_service import db_service


@pytest_asyncio.fixture(autouse=True)
async def clean_directories_and_db():
    # Setup directories
    settings.vault_dir.mkdir(parents=True, exist_ok=True)
    settings.archive_dir.mkdir(parents=True, exist_ok=True)
    settings.conflicts_dir.mkdir(parents=True, exist_ok=True)
    settings.temp_dir.mkdir(parents=True, exist_ok=True)

    await db_service.init_db()

    # Clear DB records
    async with db_service.get_connection() as conn:
        await conn.execute("DELETE FROM file_manifest")
        await conn.commit()

    # Clear directories content
    for d in [settings.vault_dir, settings.archive_dir, settings.conflicts_dir, settings.temp_dir]:
        for item in d.iterdir():
            if item.is_file():
                item.unlink(missing_ok=True)
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)

    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    return {
        "Authorization": "Bearer test-secret-token-123",
        "X-Auth-Token": "test-secret-token-123",
    }
