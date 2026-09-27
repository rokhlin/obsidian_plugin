from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from app.auth import verify_auth_token
from app.models.ai_models import (
    MetadataRequest,
    MetadataResponse,
    AiEditRequest,
    AiPromptRequest,
    TranscribeResponse,
)
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(verify_auth_token)])


@router.post("/metadata", response_model=MetadataResponse)
async def generate_note_metadata(request: MetadataRequest):
    """Generate YAML frontmatter title, description, and tags."""
    return await ai_service.generate_metadata(request.text, request.existingTags)


@router.post("/edit")
async def edit_text_streaming(request: AiEditRequest):
    """Rewrite or correct selected text via SSE streaming."""
    generator = ai_service.stream_edit(request.text, request.prompt or "Fix grammar and improve style")
    return StreamingResponse(generator, media_type="text/event-stream")


@router.post("/prompt")
async def prompt_with_context_streaming(request: AiPromptRequest):
    """Execute custom AI query with the note as context via SSE streaming."""
    generator = ai_service.stream_prompt(request.prompt, request.context)
    return StreamingResponse(generator, media_type="text/event-stream")


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_file(file: UploadFile = File(...)):
    """Transcribe mobile voice recording to Markdown text."""
    audio_bytes = await file.read()
    transcription = await ai_service.transcribe_audio(audio_bytes, file.filename or "recording.webm")
    return TranscribeResponse(text=transcription)
