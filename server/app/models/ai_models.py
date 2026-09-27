from typing import List, Optional
from pydantic import BaseModel, Field


class MetadataRequest(BaseModel):
    text: str
    existingTags: List[str] = Field(default_factory=list)


class MetadataResponse(BaseModel):
    title: str
    description: str
    tags: List[str] = Field(default_factory=list)


class AiEditRequest(BaseModel):
    text: str
    prompt: Optional[str] = "Fix grammar and improve style"


class AiPromptRequest(BaseModel):
    prompt: str
    context: str = ""


class TranscribeResponse(BaseModel):
    text: str
