import pytest
from httpx import AsyncClient
from app.config import settings


@pytest.mark.asyncio
async def test_sync_upload_and_download(client: AsyncClient, auth_headers: dict):
    # 1. Upload a file
    upload_payload = {
        "files": [
            {
                "path": "Daily/2026-09-27.md",
                "content": "# Today\n- Finish obsidian plugin",
                "mtime": 1727440000000,
                "hash": "hash-today-1",
            }
        ]
    }
    resp = await client.post("/api/sync/upload", headers=auth_headers, json=upload_payload)
    assert resp.status_code == 200
    assert "Daily/2026-09-27.md" in resp.json()["uploaded"]

    # Verify file was written to vault
    saved_file = settings.vault_dir / "Daily" / "2026-09-27.md"
    assert saved_file.exists()
    assert saved_file.read_text(encoding="utf-8") == "# Today\n- Finish obsidian plugin"

    # 2. Download the file
    download_resp = await client.post(
        "/api/sync/download", headers=auth_headers, json={"paths": ["Daily/2026-09-27.md"]}
    )
    assert download_resp.status_code == 200
    files = download_resp.json()["files"]
    assert len(files) == 1
    assert files[0]["path"] == "Daily/2026-09-27.md"
    assert files[0]["content"] == "# Today\n- Finish obsidian plugin"


@pytest.mark.asyncio
async def test_sync_status_handshake_diffing(client: AsyncClient, auth_headers: dict):
    # Upload File 1
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Notes/ProjectA.md",
                    "content": "Project A initial",
                    "mtime": 1000,
                    "hash": "hash_server_a",
                }
            ]
        },
    )

    # Handshake with client having an outdated hash for ProjectA and a new file ProjectB
    status_resp = await client.post(
        "/api/sync/status",
        headers=auth_headers,
        json={
            "clientFiles": {
                "Notes/ProjectA.md": "hash_client_different",
                "Notes/ProjectB.md": "hash_client_b",
            },
            "deletedOnClient": [],
        },
    )
    assert status_resp.status_code == 200
    data = status_resp.json()
    # ProjectA differs on client -> client must upload its version (client-priority)
    assert "Notes/ProjectA.md" in data["toUpload"]
    # ProjectB is on client only -> client must upload
    assert "Notes/ProjectB.md" in data["toUpload"]


@pytest.mark.asyncio
async def test_sync_conflict_archiving_outside_vault(client: AsyncClient, auth_headers: dict):
    # 1. Create a note on server
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Work/Design.md",
                    "content": "Server Original Version",
                    "mtime": 1000,
                    "hash": "hash_v1",
                }
            ]
        },
    )
    orig_file = settings.vault_dir / "Work" / "Design.md"
    assert orig_file.exists()

    # 2. Upload conflicting client version with differing hash
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Work/Design.md",
                    "content": "Client Priority Version Overwrite",
                    "mtime": 2000,
                    "hash": "hash_v2_client",
                }
            ]
        },
    )

    # 3. Vault note must be updated to client version
    assert orig_file.read_text(encoding="utf-8") == "Client Priority Version Overwrite"

    # 4. Conflicts folder outside vault must contain the backed-up server note
    conflict_files = list(settings.conflicts_dir.glob("Design_conflict_*.md"))
    assert len(conflict_files) >= 1
    assert conflict_files[0].read_text(encoding="utf-8") == "Server Original Version"


@pytest.mark.asyncio
async def test_sync_safe_deletion_archiving_outside_vault(client: AsyncClient, auth_headers: dict):
    # 1. Create a note
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Archived/OldNote.md",
                    "content": "To be deleted on client",
                    "mtime": 1000,
                    "hash": "hash_old",
                }
            ]
        },
    )
    vault_file = settings.vault_dir / "Archived" / "OldNote.md"
    assert vault_file.exists()

    # 2. Send status with deletedOnClient
    resp = await client.post(
        "/api/sync/status",
        headers=auth_headers,
        json={"clientFiles": {}, "deletedOnClient": ["Archived/OldNote.md"]},
    )
    assert resp.status_code == 200
    assert "Archived/OldNote.md" in resp.json()["acknowledgedDeletions"]

    # 3. File in vault is removed
    assert not vault_file.exists()

    # 4. File in external archive exists
    archived_file = settings.archive_dir / "Archived" / "OldNote.md"
    assert archived_file.exists()
    assert archived_file.read_text(encoding="utf-8") == "To be deleted on client"


@pytest.mark.asyncio
async def test_sync_direct_delete(client: AsyncClient, auth_headers: dict):
    # 1. Upload a file
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Quick/NoteToDelete.md",
                    "content": "Delete me now",
                    "mtime": 1000,
                    "hash": "hash_del",
                }
            ]
        },
    )
    vault_file = settings.vault_dir / "Quick" / "NoteToDelete.md"
    assert vault_file.exists()

    # 2. Call /api/sync/delete
    resp = await client.post(
        "/api/sync/delete",
        headers=auth_headers,
        json={"path": "Quick/NoteToDelete.md"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"
    assert not vault_file.exists()

    archived_file = settings.archive_dir / "Quick" / "NoteToDelete.md"
    assert archived_file.exists()
    assert archived_file.read_text(encoding="utf-8") == "Delete me now"
