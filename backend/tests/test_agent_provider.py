import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.agent import provider
from app.agent.prompt import SYSTEM
from app.config import get_settings
from app.vision.client import VisionUnavailable


def fake_client(text, *, blocked=False):
    response = SimpleNamespace(text=text, candidates=[SimpleNamespace(finish_reason="STOP")],
                               prompt_feedback=SimpleNamespace(block_reason="SAFETY") if blocked else None,
                               model_version="test-provider-double", usage_metadata=None)
    return SimpleNamespace(models=SimpleNamespace(generate_content=Mock(return_value=response)), close=Mock())


def test_one_typed_request_has_no_tools_and_records_provider_provenance():
    client = fake_client(json.dumps({"observations": []}))
    assessment, usage = provider.assess({"note": "Untrusted worker note"}, [("photo-id", b"fixture")], client=client)
    assert assessment.observations == [] and usage["model"] == "test-provider-double"
    client.models.generate_content.assert_called_once()
    args = client.models.generate_content.call_args.kwargs
    config = args["config"]
    assert args["model"] == get_settings().vision_model
    assert config.thinking_config.thinking_level.value.lower() == get_settings().vision_effort.lower()
    assert config.system_instruction == SYSTEM and config.max_output_tokens == 6000
    assert config.response_json_schema["additionalProperties"] is False
    assert config.automatic_function_calling.disable is True and not config.tools
    assert "Untrusted worker note" in args["contents"][0]
    assert args["contents"][1] == "Evidence photo_id=photo-id"
    client.close.assert_not_called()


@pytest.mark.parametrize("text,blocked", [("not JSON", False), ('{"observations":[],"unapproved":true}', False),
                                           ('{"observations":[]}', True)])
def test_malformed_extra_fields_and_refusal_are_rejected(text, blocked):
    with pytest.raises(ValueError):
        provider.assess({}, [], client=fake_client(text, blocked=blocked))


def test_offline_mode_never_invents_a_live_result():
    with pytest.raises(VisionUnavailable):
        provider.assess({}, [])


def test_owned_client_is_closed_and_has_bounded_http_retry(monkeypatch):
    from google import genai
    client = fake_client('{"observations":[]}')
    construct = Mock(return_value=client)
    monkeypatch.setattr(provider.vision, "mode", lambda: "gemini")
    monkeypatch.setattr(get_settings(), "gemini_api_key", "explicit-test-credential")
    monkeypatch.setattr(genai, "Client", construct)
    provider.assess({}, [])
    options = construct.call_args.kwargs["http_options"]
    assert options.timeout == get_settings().agent_timeout_seconds * 1000
    assert options.retry_options.attempts == 1
    client.close.assert_called_once()


@pytest.mark.parametrize("status", [429, 500])
def test_transcription_interactions_uses_one_http_request_on_provider_failure(monkeypatch, status):
    import httpx
    requests = []
    def transport(request):
        requests.append(request)
        assert json.loads(request.content)["store"] is False
        return httpx.Response(status, json={"error": {"code": status, "message": "Explicit provider test failure"}})
    monkeypatch.setattr(provider.vision, "mode", lambda: "gemini")
    monkeypatch.setattr(get_settings(), "gemini_api_key", "explicit-test-credential")
    with httpx.Client(transport=httpx.MockTransport(transport)) as client, pytest.raises(httpx.HTTPStatusError):
        provider.transcribe(b"explicit audio fixture", "audio/webm", client=client)
    assert len(requests) == 1


def test_transcription_rest_inline_audio_preserves_text_and_normalizes_m4a(monkeypatch):
    import httpx
    def transport(request):
        body = json.loads(request.content)
        assert body["model"] == "gemini-3.5-transcribe" and body["input"][0]["mime_type"] == "audio/m4a"
        assert body["generation_config"]["transcription_config"]["mode"] == {"type": "verbatim"}
        return httpx.Response(200, json={"id": "test-interaction", "status": "completed", "model": "gemini-3.5-transcribe",
            "steps": [{"type": "model_output", "content": [{"type": "text", "text": "Sink positioned"}]}]})
    monkeypatch.setattr(provider.vision, "mode", lambda: "gemini")
    monkeypatch.setattr(get_settings(), "gemini_api_key", "explicit-test-credential")
    with httpx.Client(transport=httpx.MockTransport(transport)) as client:
        assert provider.transcribe(b"explicit audio fixture", "audio/mp4", client=client) == ("Sink positioned", "gemini-3.5-transcribe")


def test_chat_prompt_prioritizes_the_question_and_bounded_daily_activity(monkeypatch):
    captured = []
    def step(instruction, context, schema):
        captured.append((instruction, context, schema))
        return provider.DraftChat(message="No updates recorded today.", source_ids=[], suggested_questions=[])
    monkeypatch.setattr(provider, "_text_step", step)
    context = {"question": "Give me today's updates", "dailyActivity": {"visibleEventCount": 0}}
    result = provider.chat(context)
    instruction, packet, schema = captured[0]
    assert "at most 80 words" in instruction
    assert "project-wide dailyActivity" in instruction
    assert "never present old activity as today's work" in instruction
    assert "no" in instruction and "write authority" in instruction
    assert packet is context and schema is provider.DraftChat
    assert result.message == "No updates recorded today."
