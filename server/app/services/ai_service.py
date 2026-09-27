import json
import asyncio
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.config import settings
from app.models.ai_models import MetadataResponse

logger = logging.getLogger(__name__)


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
            except Exception as e:
                logger.error("Failed to initialize Gemini client: %s", e)
                self._client = None
        return self._client

    def _get_candidate_models(self) -> List[str]:
        """Return priority-ordered list of candidate Gemini models to handle transient errors/rate-limits."""
        primary = settings.GEMINI_MODEL or "gemini-3.5-flash-lite"
        candidates = [primary, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash"]
        seen = set()
        result = []
        for model in candidates:
            if model and model not in seen:
                seen.add(model)
                result.append(model)
        return result

    async def generate_metadata(self, text: str, existing_tags: List[str]) -> MetadataResponse:
        client = self._get_genai_client()
        first_line = text.strip().split("\n")[0].replace("#", "").strip() if text.strip() else "Untitled Note"
        default_title = first_line[:50] or "Note Summary"

        if not client:
            # Clean fallback when API key is not configured
            relevant_tags = [t for t in existing_tags if t.lstrip("#").lower() in text.lower()][:3]
            return MetadataResponse(
                title=default_title,
                description="Note draft (Configure GEMINI_API_KEY in data/config/.env)",
                tags=relevant_tags or ["#note"],
            )

        prompt = (
            "You are an expert Obsidian note organizer. Analyze the following note content.\n\n"
            "Generate metadata strictly based on the note's subject, content, and language:\n"
            "1. 'title': A concise, descriptive title representing the note's actual content (in the same language as the note).\n"
            "2. 'description': A clear 1-2 sentence summary of the note.\n"
            "3. 'tags': A JSON list of 3-7 relevant lowercase tags prefixed with '#' (e.g. ['#docker', '#backend']).\n\n"
            "CRITICAL TAG REQUIREMENTS:\n"
            "- All tags MUST directly reflect the topic and content of THIS specific note.\n"
            f"- Existing vault tags for reference: {existing_tags[:30]}.\n"
            "- ONLY reuse an existing tag if it is genuinely relevant to this note's topic. NEVER assign unrelated tags.\n"
            "- If existing tags do not fit, generate new, accurate, lowercase tags.\n\n"
            "Respond strictly with a JSON object containing keys 'title', 'description', and 'tags'.\n\n"
            f"Note Content:\n{text[:8000]}"
        )

        candidate_models = self._get_candidate_models()
        loop = asyncio.get_running_loop()

        for model in candidate_models:
            try:
                response = await loop.run_in_executor(
                    None,
                    lambda m=model: client.models.generate_content(
                        model=m,
                        contents=prompt,
                        config={"response_mime_type": "application/json"},
                    ),
                )
                if response and response.text:
                    data = json.loads(response.text)
                    raw_tags = data.get("tags", [])
                    cleaned_tags = []
                    for t in raw_tags:
                        tag_str = str(t).strip().lower()
                        if not tag_str.startswith("#"):
                            tag_str = f"#{tag_str}"
                        if tag_str not in cleaned_tags:
                            cleaned_tags.append(tag_str)

                    return MetadataResponse(
                        title=data.get("title", default_title),
                        description=data.get("description", ""),
                        tags=cleaned_tags or ["#note"],
                    )
            except Exception as e:
                logger.warning("generate_metadata attempt failed on model %s: %s", model, e)
                continue

        # If all models fail, fallback cleanly without assigning random unrelated tags
        relevant_tags = [t for t in existing_tags if t.lstrip("#").lower() in text.lower()][:3]
        return MetadataResponse(
            title=default_title,
            description="Metadata generated with local text extraction.",
            tags=relevant_tags or ["#note"],
        )

    async def stream_edit(
        self,
        text: str,
        instructions: str,
        context: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        client = self._get_genai_client()
        if not client:
            simulated = f"[Edited]: {text.strip()} (Style polished)"
            for word in simulated.split(" "):
                yield f"data: {json.dumps({'chunk': word + ' '})}\n\n"
                await asyncio.sleep(0.02)
            yield "data: [DONE]\n\n"
            return

        context_section = ""
        if context and context.strip() and context.strip() != text.strip():
            context_section = f"Surrounding Note Context:\n{context[:6000]}\n\n"

        prompt = (
            f"{context_section}"
            f"Instruction: {instructions}\n"
            "Rewrite and improve the target text below according to the instruction, while maintaining the same language, intended meaning, and fitting seamlessly into the note's context.\n"
            "CRITICAL: Output ONLY the improved replacement text. Do NOT add conversational commentary, explanations, alternatives, or quotation marks.\n\n"
            f"Target Text:\n{text}"
        )

        candidate_models = self._get_candidate_models()
        loop = asyncio.get_running_loop()

        for model in candidate_models:
            try:
                response_stream = await loop.run_in_executor(
                    None,
                    lambda m=model: client.models.generate_content_stream(
                        model=m,
                        contents=prompt,
                    ),
                )
                stream_started = False
                for chunk in response_stream:
                    if chunk.text:
                        stream_started = True
                        yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                        await asyncio.sleep(0.005)

                if stream_started:
                    yield "data: [DONE]\n\n"
                    return
            except Exception as e:
                logger.warning("stream_edit attempt failed on model %s: %s", model, e)
                continue

        yield f"data: {json.dumps({'error': 'AI service currently unavailable. Please try again later.'})}\n\n"
        yield "data: [DONE]\n\n"

    async def stream_prompt(self, user_prompt: str, context: str) -> AsyncGenerator[str, None]:
        client = self._get_genai_client()
        if not client:
            response_text = (
                f"Response to '{user_prompt}': Note analyzed. "
                "(Configure GEMINI_API_KEY in data/config/.env for live model responses)."
            )
            for word in response_text.split(" "):
                yield f"data: {json.dumps({'chunk': word + ' '})}\n\n"
                await asyncio.sleep(0.02)
            yield "data: [DONE]\n\n"
            return

        prompt = (
            "You are an expert Obsidian assistant. The user has provided context from their active note.\n\n"
            f"Note Context:\n{context[:12000] if context else '(No active note context provided)'}\n\n"
            f"User Query/Prompt:\n{user_prompt}\n\n"
            "OUTPUT FORMAT & BEHAVIORAL REQUIREMENTS:\n"
            "1. Output format MUST be clean, valid Markdown (MD).\n"
            "2. DIRECT RESULT ONLY: Output strictly the direct content or answer requested. Do NOT include conversational pleasantries, chatter, introductory preambles (e.g. 'Sure, here is...', 'Here is the summary:'), or concluding postambles (e.g. 'I hope this helps!', 'Let me know if you need more help.').\n"
            "3. If the user prompt asks for a specific structure (e.g. checklist, table, bullet points, headers), apply it directly in Markdown.\n"
            "4. Only provide meta-explanations if the user explicitly asks for an explanation or conversation."
        )

        candidate_models = self._get_candidate_models()
        loop = asyncio.get_running_loop()

        for model in candidate_models:
            try:
                response_stream = await loop.run_in_executor(
                    None,
                    lambda m=model: client.models.generate_content_stream(
                        model=m,
                        contents=prompt,
                    ),
                )
                stream_started = False
                for chunk in response_stream:
                    if chunk.text:
                        stream_started = True
                        yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                        await asyncio.sleep(0.005)

                if stream_started:
                    yield "data: [DONE]\n\n"
                    return
            except Exception as e:
                logger.warning("stream_prompt attempt failed on model %s: %s", model, e)
                continue

        yield f"data: {json.dumps({'error': 'AI service currently unavailable. Please try again later.'})}\n\n"
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
            candidate_models = self._get_candidate_models()

            transcribe_instruction = (
                "You are an expert voice-to-note transcriber and organizer for Obsidian.\n\n"
                "Listen carefully to the audio recording. Analyze the spoken content to separate any structural, formatting, or task directives from the actual note content.\n\n"
                "CRITICAL INSTRUCTIONS - DIRECTIVE VS CONTENT SEPARATION:\n"
                "1. Formatting / Structural Directives:\n"
                "   The speaker may begin or include instructions on how the note should be organized or formatted (for example: 'сделай из заметки список покупок: ...', 'make a shopping list out of this: ...', 'format as a checklist: ...', 'create bullet points for: ...', 'сделай чек-лист задач: ...', 'структурируй по пунктам: ...').\n"
                "   - Extract the formatting/structural instruction.\n"
                "   - Extract the substantive note items/content dictated by the user.\n"
                "   - Apply the requested structure directly (e.g., render as a Markdown task checklist `- [ ] item`, bulleted list `- item`, numbered list, or headings).\n"
                "   - Do NOT transcribe the meta-instruction command verbatim (e.g. do NOT include 'Сделай из заметки список покупок' in the output; output only the resulting structured list).\n\n"
                "2. Plain Dictation:\n"
                "   If the speaker is simply dictating thoughts, notes, or ideas without formatting directives, transcribe the audio accurately into clean, well-punctuated Markdown text and paragraphs.\n\n"
                "3. Direct Markdown Output:\n"
                "   Output strictly the resulting Markdown note. Do NOT include conversational pleasantries, introductory remarks ('Here is your shopping list:'), or concluding chatter."
            )

            for model in candidate_models:
                try:
                    response = await loop.run_in_executor(
                        None,
                        lambda m=model: client.models.generate_content(
                            model=m,
                            contents=[transcribe_instruction, part],
                        ),
                    )
                    if response and response.text:
                        return response.text.strip()
                except Exception as me:
                    logger.warning("transcribe_audio model %s failed: %s", model, me)
                    continue

            return "Audio transcription failed: AI models unavailable."
        except Exception as e:
            return f"Audio transcription error: {str(e)}"


ai_service = AiService()
