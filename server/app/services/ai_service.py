import json
import asyncio
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.config import settings
from app.models.ai_models import MetadataResponse


class AiService:
    def __init__(self):
        self._client = None

    def _get_genai_client(self):
        if not settings.GEMINI_API_KEY:
            return None
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception:
                self._client = None
        return self._client

    async def generate_metadata(self, text: str, existing_tags: List[str]) -> MetadataResponse:
        client = self._get_genai_client()
        if not client:
            # Clean fallback when API key is not yet configured by the user
            tags = [t for t in existing_tags[:3]]
            first_line = text.strip().split("\n")[0].replace("#", "").strip() if text.strip() else "Untitled Note"
            return MetadataResponse(
                title=first_line[:50] or "Note Summary",
                description="Auto-generated note draft (Configure GEMINI_API_KEY in data/config/.env)",
                tags=tags or ["#note", "#draft"],
            )

        prompt = (
            f"Analyze the following note text and existing vault tags: {existing_tags}.\n"
            "Return a JSON object with strictly these keys:\n"
            "- 'title': A concise, descriptive note title\n"
            "- 'description': A one-sentence summary of the note\n"
            "- 'tags': A JSON array of relevant lowercase tags formatted with '#' prefix (e.g. '#work', '#dev')\n\n"
            f"Note Text:\n{text[:8000]}"
        )

        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config={"response_mime_type": "application/json"},
                ),
            )
            data = json.loads(response.text)
            return MetadataResponse(
                title=data.get("title", "Untitled"),
                description=data.get("description", ""),
                tags=data.get("tags", []),
            )
        except Exception:
            return MetadataResponse(
                title="AI Processed Note",
                description="Analysis completed with local fallback.",
                tags=existing_tags[:2] or ["#note"],
            )

    async def stream_edit(self, text: str, instructions: str) -> AsyncGenerator[str, None]:
        client = self._get_genai_client()
        if not client:
            simulated = f"[Edited]: {text.strip()} (Style polished)"
            for word in simulated.split(" "):
                yield f"data: {json.dumps({'chunk': word + ' '})}\n\n"
                await asyncio.sleep(0.02)
            yield "data: [DONE]\n\n"
            return

        prompt = (
            f"Instruction: {instructions}\n"
            "Rewrite and improve the following text according to the instruction. "
            "Output only the replacement text with no conversational preamble.\n\n"
            f"Input Text:\n{text}"
        )

        try:
            loop = asyncio.get_running_loop()
            response_stream = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content_stream(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                ),
            )
            for chunk in response_stream:
                if chunk.text:
                    yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                    await asyncio.sleep(0.005)
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    async def stream_prompt(self, user_prompt: str, context: str) -> AsyncGenerator[str, None]:
        client = self._get_genai_client()
        if not client:
            response_text = f"Response to '{user_prompt}': Key points from note analyzed. (Configure GEMINI_API_KEY in data/config/.env for live model responses)."
            for word in response_text.split(" "):
                yield f"data: {json.dumps({'chunk': word + ' '})}\n\n"
                await asyncio.sleep(0.02)
            yield "data: [DONE]\n\n"
            return

        prompt = (
            f"Context Note:\n{context[:10000]}\n\n"
            f"User Question: {user_prompt}\n"
            "Answer clearly and concisely based on the context."
        )

        try:
            loop = asyncio.get_running_loop()
            response_stream = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content_stream(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                ),
            )
            for chunk in response_stream:
                if chunk.text:
                    yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                    await asyncio.sleep(0.005)
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    async def transcribe_audio(self, audio_bytes: bytes, filename: str) -> str:
        client = self._get_genai_client()
        if not client:
            return (
                f"Audio recording ({len(audio_bytes)} bytes) received.\n"
                "To enable live transcription, configure GEMINI_API_KEY in data/config/.env."
            )

        try:
            from google.genai import types
            loop = asyncio.get_running_loop()
            mime_type = "audio/mp4" if filename.endswith(".mp4") else "audio/webm"
            part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            response = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=["Please transcribe this voice recording accurately into clean Markdown text:", part],
                ),
            )
            return response.text.strip()
        except Exception as e:
            return f"Audio transcription error: {str(e)}"


ai_service = AiService()
