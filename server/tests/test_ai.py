import pytest
import io
import inspect
from httpx import AsyncClient
from app.services.ai_service import ai_service


@pytest.mark.asyncio
async def test_ai_metadata_generation(client: AsyncClient, auth_headers: dict):
    payload = {
        "text": "# Project Apollo\nThis note outlines the flight operations and checklists for Apollo.",
        "existingTags": ["#space", "#flight", "#checklist"],
    }
    resp = await client.post("/api/ai/metadata", headers=auth_headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "title" in data
    assert "description" in data
    assert "tags" in data
    assert isinstance(data["tags"], list)


@pytest.mark.asyncio
async def test_ai_edit_streaming(client: AsyncClient, auth_headers: dict):
    payload = {
        "text": "This text has bad grammer and need fix.",
        "prompt": "Fix spelling and grammar",
        "context": "Full note content with details about the project.",
    }
    resp = await client.post("/api/ai/edit", headers=auth_headers, json=payload)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    content = resp.text
    assert "data: " in content


@pytest.mark.asyncio
async def test_ai_prompt_streaming(client: AsyncClient, auth_headers: dict):
    payload = {
        "prompt": "What is the primary objective?",
        "context": "The primary objective is landing safely on the lunar surface.",
    }
    resp = await client.post("/api/ai/prompt", headers=auth_headers, json=payload)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    content = resp.text
    assert "data: " in content


@pytest.mark.asyncio
async def test_ai_audio_transcription(client: AsyncClient, auth_headers: dict):
    fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....fake audio bytes")
    files = {"file": ("test_recording.webm", fake_audio, "audio/webm")}
    resp = await client.post("/api/ai/transcribe", headers=auth_headers, files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert len(data["text"]) > 0


def test_prompt_system_instruction_markdown_and_direct_result():
    source = inspect.getsource(ai_service.stream_prompt)
    assert "Output format MUST be clean, valid Markdown (MD)" in source
    assert "DIRECT RESULT ONLY" in source
    assert "conversational pleasantries" in source


def test_transcribe_instruction_intent_content_separation():
    source = inspect.getsource(ai_service.transcribe_audio)
    assert "DIRECTIVE VS CONTENT SEPARATION" in source
    assert "Extract the formatting/structural instruction" in source
    assert "Extract the substantive note items/content" in source
    assert "Do NOT transcribe the meta-instruction command verbatim" in source
