import pytest
import io
from httpx import AsyncClient


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
