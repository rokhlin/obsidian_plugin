from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class SyncStatusRequest(BaseModel):
    clientFiles: Dict[str, str] = Field(default_factory=dict, description="Map of relative file path to client xxHash")
    deletedOnClient: List[str] = Field(default_factory=list, description="List of files deleted locally on the client")


class SyncStatusResponse(BaseModel):
    status: str = "ok"
    toDownload: List[str] = Field(default_factory=list, description="Files on server needed by client")
    toUpload: List[str] = Field(default_factory=list, description="Files on client needed by server")
    acknowledgedDeletions: List[str] = Field(default_factory=list, description="Deletions processed and archived on server")


class SyncFilePayload(BaseModel):
    path: str
    content: str
    mtime: int
    hash: str


class SyncUploadRequest(BaseModel):
    files: List[SyncFilePayload] = Field(default_factory=list)


class SyncUploadResponse(BaseModel):
    status: str = "ok"
    uploaded: List[str] = Field(default_factory=list)


class SyncDownloadRequest(BaseModel):
    paths: List[str] = Field(default_factory=list)


class SyncDownloadResponse(BaseModel):
    files: List[SyncFilePayload] = Field(default_factory=list)


class SyncDeleteRequest(BaseModel):
    path: str


class SyncDeleteResponse(BaseModel):
    status: str = "archived"
    path: str
