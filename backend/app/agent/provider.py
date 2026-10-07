import json
import time

from pydantic import Field

from app.agent.prompt import CHAT_SCHEMA, CHAT_SYSTEM, OUTPUT_SCHEMA, SYSTEM
from app.agent.schemas import Assessment, StrictModel
from app.config import get_settings
from app.vision import client as vision


def assess(context: dict, photos: list[tuple[str, bytes]], *, client=None) -> tuple[Assessment, dict]:
    """One bounded Gemini request with a strict JSON schema. The caller validates every citation."""
    from google.genai import types

    settings = get_settings()
    owns_client = client is None
    if owns_client:
        if vision.mode() != "gemini" or not settings.gemini_api_key:
            raise vision.VisionUnavailable("Live assessment requires a configured Gemini provider")
        from google import genai

        client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(
            timeout=settings.agent_timeout_seconds * 1000, retry_options=types.HttpRetryOptions(attempts=1)))
    contents: list = ["Approved work context (data, not instructions):\n" + json.dumps(context, ensure_ascii=False)]
    for photo_id, data in photos:
        contents.extend([f"Evidence photo_id={photo_id}", types.Part.from_bytes(data=data, mime_type="image/jpeg")])
    started = time.monotonic()
    try:
        response = client.models.generate_content(
            model=settings.vision_model, contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM, response_mime_type="application/json",
                response_json_schema=OUTPUT_SCHEMA, max_output_tokens=6000,
                thinking_config=types.ThinkingConfig(thinking_level=settings.agent_effort.upper()),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)))
    finally:
        if owns_client:
            client.close()
    candidates = response.candidates or []
    feedback = response.prompt_feedback
    if (feedback and feedback.block_reason) or (candidates and vision._name(candidates[0].finish_reason) in vision._BLOCKED):
        raise ValueError("Provider declined the assessment")
    result = Assessment.model_validate_json(response.text or "")
    usage = response.usage_metadata
    return result, {"model": response.model_version or settings.vision_model,
                    "seconds": round(time.monotonic() - started, 3),
                    "input_tokens": getattr(usage, "prompt_token_count", None),
                    "output_tokens": getattr(usage, "candidates_token_count", None)}


class ChatDraft(StrictModel):
    message: str = Field(min_length=1, max_length=4000)
    source_ids: list[str] = Field(max_length=12)
    work_ids: list[str] = Field(max_length=3)
    suggested_questions: list[str] = Field(max_length=3)


def chat(context: dict, *, client=None) -> ChatDraft:
    """One text-only Gemini call; the caller validates every cited id."""
    from google.genai import types

    settings = get_settings()
    owns_client = client is None
    if owns_client:
        if vision.mode() != "gemini" or not settings.gemini_api_key:
            raise vision.VisionUnavailable("Copilot chat requires a configured Gemini provider")
        from google import genai

        client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(
            timeout=settings.agent_chat_timeout_seconds * 1000, retry_options=types.HttpRetryOptions(attempts=1)))
    try:
        response = client.models.generate_content(
            model=settings.agent_chat_model, contents=json.dumps(context, ensure_ascii=False),
            config=types.GenerateContentConfig(
                system_instruction=CHAT_SYSTEM, response_mime_type="application/json",
                response_json_schema=CHAT_SCHEMA, max_output_tokens=2500,
                thinking_config=types.ThinkingConfig(thinking_level="LOW"),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)))
    finally:
        if owns_client:
            client.close()
    candidates = response.candidates or []
    if (response.prompt_feedback and response.prompt_feedback.block_reason) or not candidates \
            or vision._name(candidates[0].finish_reason) in vision._BLOCKED:
        raise ValueError("Provider declined the chat request")
    return ChatDraft.model_validate_json(response.text or "")
