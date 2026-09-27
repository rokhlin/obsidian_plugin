import shutil
import xxhash
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from app.config import settings
from app.services.db_service import DatabaseService, db_service
from app.models.sync_models import (
    SyncStatusRequest,
    SyncStatusResponse,
    SyncUploadRequest,
    SyncUploadResponse,
    SyncDownloadRequest,
    SyncDownloadResponse,
    SyncFilePayload,
    SyncDeleteResponse,
)


class SyncService:
    def __init__(self, db: DatabaseService = db_service):
        self.db = db

    def compute_hash(self, content: str) -> str:
        """Compute 64-bit xxHash matching client xxhash-wasm output (hex string)."""
        return xxhash.xxh64(content.encode("utf-8")).hexdigest()

    async def sync_server_filesystem_to_db(self) -> None:
        """Scan server vault directory to register any files added directly on server."""
        vault = settings.vault_dir
        if not vault.exists():
            return
        manifest = await self.db.get_all_manifest_records()
        for file_path in vault.rglob("*"):
            if file_path.is_file() and not file_path.name.startswith("."):
                rel_path = file_path.relative_to(vault).as_posix()
                if rel_path not in manifest:
                    try:
                        content = file_path.read_text(encoding="utf-8", errors="replace")
                        file_hash = self.compute_hash(content)
                        mtime = int(file_path.stat().st_mtime * 1000)
                        await self.db.upsert_record(rel_path, file_hash, mtime)
                    except Exception:
                        pass

    async def get_sync_status(self, request: SyncStatusRequest) -> SyncStatusResponse:
        await self.sync_server_filesystem_to_db()
        server_manifest = await self.db.get_all_manifest_records()

        acknowledged_deletions: List[str] = []
        # Process client deletions first (safe archiving)
        for del_path in request.deletedOnClient:
            norm_path = del_path.replace("\\", "/").strip("/")
            file_on_server = settings.vault_dir / norm_path
            if file_on_server.exists():
                archive_dest = settings.archive_dir / norm_path
                archive_dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(file_on_server), str(archive_dest))

            await self.db.remove_record(norm_path)
            acknowledged_deletions.append(norm_path)
            if norm_path in server_manifest:
                del server_manifest[norm_path]

        to_upload: List[str] = []
        # Compare client files with server manifest
        for client_path, client_hash in request.clientFiles.items():
            norm_path = client_path.replace("\\", "/").strip("/")
            if norm_path not in server_manifest:
                to_upload.append(norm_path)
            elif server_manifest[norm_path]["hash"] != client_hash:
                to_upload.append(norm_path)

        to_download: List[str] = []
        # Files on server that client does not have and hasn't deleted
        for server_path, server_data in server_manifest.items():
            if server_path not in request.clientFiles and server_path not in acknowledged_deletions:
                to_download.append(server_path)

        return SyncStatusResponse(
            status="ok",
            toDownload=sorted(to_download),
            toUpload=sorted(to_upload),
            acknowledgedDeletions=sorted(acknowledged_deletions),
        )

    async def process_upload(self, request: SyncUploadRequest) -> SyncUploadResponse:
        uploaded_files: List[str] = []
        for file in request.files:
            norm_path = file.path.replace("\\", "/").strip("/")
            dest_file = settings.vault_dir / norm_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)

            # Conflict Detection: If file exists and server hash != incoming hash, archive server version to conflicts
            if dest_file.exists():
                try:
                    current_server_content = dest_file.read_text(encoding="utf-8", errors="replace")
                    current_server_hash = self.compute_hash(current_server_content)
                    if current_server_hash != file.hash:
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        stem = dest_file.stem
                        suffix = dest_file.suffix
                        conflict_dest = settings.conflicts_dir / f"{stem}_conflict_{timestamp}{suffix}"
                        conflict_dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(str(dest_file), str(conflict_dest))
                except Exception:
                    pass

            # Write client's content (Client-Priority)
            dest_file.write_text(file.content, encoding="utf-8")
            
            # Recalculate hash if not provided or verify
            verified_hash = file.hash or self.compute_hash(file.content)
            await self.db.upsert_record(norm_path, verified_hash, file.mtime)
            uploaded_files.append(norm_path)

        return SyncUploadResponse(status="ok", uploaded=uploaded_files)

    async def process_download(self, request: SyncDownloadRequest) -> SyncDownloadResponse:
        files: List[SyncFilePayload] = []
        for path in request.paths:
            norm_path = path.replace("\\", "/").strip("/")
            src_file = settings.vault_dir / norm_path
            if src_file.exists() and src_file.is_file():
                content = src_file.read_text(encoding="utf-8", errors="replace")
                mtime = int(src_file.stat().st_mtime * 1000)
                record = await self.db.get_file_record(norm_path)
                file_hash = record["hash"] if record else self.compute_hash(content)
                files.append(
                    SyncFilePayload(
                        path=norm_path,
                        content=content,
                        mtime=mtime,
                        hash=file_hash,
                    )
                )

        return SyncDownloadResponse(files=files)

    async def process_delete(self, path: str) -> SyncDeleteResponse:
        norm_path = path.replace("\\", "/").strip("/")
        src_file = settings.vault_dir / norm_path
        if src_file.exists() and src_file.is_file():
            archive_dest = settings.archive_dir / norm_path
            archive_dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_file), str(archive_dest))

        await self.db.remove_record(norm_path)
        return SyncDeleteResponse(status="archived", path=norm_path)


sync_service = SyncService()
