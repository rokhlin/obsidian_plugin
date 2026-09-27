from fastapi import APIRouter, Depends
from app.auth import verify_auth_token
from app.models.sync_models import (
    SyncStatusRequest,
    SyncStatusResponse,
    SyncUploadRequest,
    SyncUploadResponse,
    SyncDownloadRequest,
    SyncDownloadResponse,
    SyncDeleteRequest,
    SyncDeleteResponse,
)
from app.services.sync_service import sync_service

router = APIRouter(prefix="/api/sync", tags=["sync"], dependencies=[Depends(verify_auth_token)])


@router.post("/status", response_model=SyncStatusResponse)
async def check_sync_status(request: SyncStatusRequest):
    """Handshake endpoint to compare client and server manifests."""
    return await sync_service.get_sync_status(request)


@router.post("/upload", response_model=SyncUploadResponse)
async def upload_files(request: SyncUploadRequest):
    """Upload new/modified notes from client with client-priority and conflict archiving."""
    return await sync_service.process_upload(request)


@router.post("/download", response_model=SyncDownloadResponse)
async def download_files(request: SyncDownloadRequest):
    """Download server files requested by the client."""
    return await sync_service.process_download(request)


@router.post("/delete", response_model=SyncDeleteResponse)
async def delete_file(request: SyncDeleteRequest):
    """Soft-delete note by moving it to the external archive directory."""
    return await sync_service.process_delete(request.path)
