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


@pytest.mark.asyncio
async def test_sync_file_move_rename_without_duplication(client: AsyncClient, auth_headers: dict):
    # 1. Initially upload file at original path
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Notes/Idea.md",
                    "content": "# Revolutionary Idea",
                    "mtime": 1000,
                    "hash": "hash_idea_v1",
                }
            ]
        },
    )
    orig_file = settings.vault_dir / "Notes" / "Idea.md"
    assert orig_file.exists()

    # 2. Defect Demonstration: If client moved file to Archive/Idea.md but didn't tombstone Notes/Idea.md,
    # server would return Notes/Idea.md in toDownload, causing duplication.
    bug_status_resp = await client.post(
        "/api/sync/status",
        headers=auth_headers,
        json={
            "clientFiles": {"Archive/Idea.md": "hash_idea_v1"},
            "deletedOnClient": [],  # Old bug: rename did not record deletion
        },
    )
    assert bug_status_resp.status_code == 200
    bug_data = bug_status_resp.json()
    assert "Notes/Idea.md" in bug_data["toDownload"]  # Reproduces bug: server instructs download of old file

    # 3. Verified Fix: With rename tombstone sent in deletedOnClient
    fix_status_resp = await client.post(
        "/api/sync/status",
        headers=auth_headers,
        json={
            "clientFiles": {"Archive/Idea.md": "hash_idea_v1"},
            "deletedOnClient": ["Notes/Idea.md"],
        },
    )
    assert fix_status_resp.status_code == 200
    fix_data = fix_status_resp.json()
    # Old path must be acknowledged and archived
    assert "Notes/Idea.md" in fix_data["acknowledgedDeletions"]
    # Old path MUST NOT be in toDownload (no resurrection/duplication)
    assert "Notes/Idea.md" not in fix_data["toDownload"]
    assert "Archive/Idea.md" in fix_data["toUpload"]
    # Old file on server must be removed from vault and present in archive
    assert not orig_file.exists()
    archived_orig = settings.archive_dir / "Notes" / "Idea.md"
    assert archived_orig.exists()

    # 4. Client completes upload of moved file
    upload_resp = await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "Archive/Idea.md",
                    "content": "# Revolutionary Idea",
                    "mtime": 2000,
                    "hash": "hash_idea_v1",
                }
            ]
        },
    )
    assert upload_resp.status_code == 200
    assert "Archive/Idea.md" in upload_resp.json()["uploaded"]

    new_file = settings.vault_dir / "Archive" / "Idea.md"
    assert new_file.exists()


@pytest.mark.asyncio
async def test_sync_server_disk_file_moved_cleanup(client: AsyncClient, auth_headers: dict):
    from app.services.sync_service import sync_service

    # 1. Upload a file
    await client.post(
        "/api/sync/upload",
        headers=auth_headers,
        json={
            "files": [
                {
                    "path": "ServerMove/OldDisk.md",
                    "content": "On disk note",
                    "mtime": 1000,
                    "hash": "hash_disk_1",
                }
            ]
        },
    )
    old_disk_file = settings.vault_dir / "ServerMove" / "OldDisk.md"
    assert old_disk_file.exists()

    # 2. Simulate moving the file directly on server filesystem
    new_disk_dir = settings.vault_dir / "ServerMove" / "Sub"
    new_disk_dir.mkdir(parents=True, exist_ok=True)
    new_disk_file = new_disk_dir / "NewDisk.md"
    old_disk_file.rename(new_disk_file)

    # 3. Server filesystem scan runs
    await sync_service.sync_server_filesystem_to_db()

    # 4. Status handshake: Server must know OldDisk.md is gone and NewDisk.md exists
    status_resp = await client.post(
        "/api/sync/status",
        headers=auth_headers,
        json={"clientFiles": {}, "deletedOnClient": []},
    )
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert "ServerMove/OldDisk.md" not in data["toDownload"]
    assert "ServerMove/Sub/NewDisk.md" in data["toDownload"]
