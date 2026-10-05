"""Calls the vision model (Google Gemini) and returns validated per-element verdicts. The model is a
config value (VISION_MODEL); credentials come from the environment (GEMINI_API_KEY or GOOGLE_API_KEY)."""

import json
import logging
import time
from dataclasses import dataclass, field

from app.config import get_settings
from app.vision.prompt import OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM, VERDICTS, user_text

log = logging.getLogger(__name__)


@dataclass
class Verdict:
    element_id: str
    verdict: str
    confidence: float
    reason: str


@dataclass
class AnalysisResult:
    verdicts: list[Verdict]
    model: str
    prompt_version: str = PROMPT_VERSION
    raw: dict = field(default_factory=dict)  # stored on the upload for audit
    error: str | None = None


class VisionUnavailable(RuntimeError):
    pass


def validate(data: object, expected_ids: list[str]) -> list[Verdict]:
    """Exactly one verdict per expected element. Unknown ids are dropped; missing ones become
    'uncertain' with confidence 0, so nothing turns green by omission."""
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("response is not {results: [...]}")
    got: dict[str, Verdict] = {}
    for r in data["results"]:
        if not isinstance(r, dict):
            continue
        eid = str(r.get("element_id", ""))
        v = r.get("verdict")
        if eid not in expected_ids or v not in VERDICTS or eid in got:
            continue
        try:
            conf = float(r.get("confidence", 0))
        except (TypeError, ValueError):
            conf = 0.0
        got[eid] = Verdict(eid, v, max(0.0, min(1.0, conf)), str(r.get("reason", ""))[:500])
    return [got.get(e) or Verdict(e, "uncertain", 0.0, "No verdict returned for this element") for e in expected_ids]


def _image_part(jpeg: bytes):
    from google.genai import types

    return types.Part.from_bytes(data=jpeg, mime_type="image/jpeg")


def build_content(photos: list[bytes], reference: bytes | None, zone: str, trade: str, note: str,
                  elements: list[dict]) -> list:
    content: list = []
    for i, p in enumerate(photos, 1):
        content += [f"Photo {i}:", _image_part(p)]
    if reference:
        content += ["REFERENCE (3D model render, not a photo):", _image_part(reference)]
    content.append(user_text(zone, trade, note, elements, len(photos), bool(reference)))
    return content


def mode() -> str:
    s = get_settings()
    if s.vision_mode != "auto":
        return s.vision_mode
    import os

    has_creds = bool(s.gemini_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    return "gemini" if has_creds else "off"


def _client():
    from google import genai

    s = get_settings()
    return genai.Client(api_key=s.gemini_api_key) if s.gemini_api_key else genai.Client()


# Finish/block reasons that mean the model declined to answer (treated like a refusal: fail safe, no retry).
_BLOCKED = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "RECITATION"}


def _name(v) -> str | None:
    return None if v is None else getattr(v, "name", None) or str(v)


def analyze(photos: list[bytes], reference: bytes | None, *, zone: str, trade: str, note: str,
            elements: list[dict], client=None, model: str | None = None) -> AnalysisResult:
    """photos/reference: JPEG bytes (already resized). elements: dicts with id, ifc_class, name, props,
    position_hint. Raises VisionUnavailable when analysis is switched off."""
    s = get_settings()
    m = mode() if client is None else "gemini"
    ids = [e["id"] for e in elements]
    model = model or s.vision_model
    if m == "off":
        raise VisionUnavailable("Photo analysis is off (no Gemini credentials or VISION_MODE=off)")
    if m == "mock":
        return AnalysisResult([Verdict(e, "uncertain", 0.0, "mock analysis") for e in ids], "mock", raw={"mock": True})
    if not ids:
        return AnalysisResult([], model)
    from google.genai import types

    client = client or _client()
    contents = build_content(photos, reference, zone, trade, note, elements)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        response_mime_type="application/json",
        response_json_schema=OUTPUT_SCHEMA,
        thinking_config=types.ThinkingConfig(thinking_level=s.vision_effort.upper()),
        max_output_tokens=16000,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    last_err = None
    for attempt in range(2):  # one retry on malformed output
        t = time.time()
        resp = client.models.generate_content(model=model, contents=contents, config=config)
        cand = (resp.candidates or [None])[0]
        finish = _name(getattr(cand, "finish_reason", None))
        block = _name(getattr(resp.prompt_feedback, "block_reason", None)) if resp.prompt_feedback else None
        usage = resp.usage_metadata
        raw = {"attempt": attempt + 1, "model": resp.model_version or model, "finish_reason": finish,
               "seconds": round(time.time() - t, 2), "response_id": resp.response_id,
               "usage": {"input": getattr(usage, "prompt_token_count", None), "output": getattr(usage, "candidates_token_count", None),
                         "thinking": getattr(usage, "thoughts_token_count", None)}}
        if block or finish in _BLOCKED:
            last_err = f"model declined the request ({block or finish})"
            raw["error"] = last_err
            break
        try:
            verdicts = validate(json.loads(resp.text or ""), ids)
            raw["results"] = [v.__dict__ for v in verdicts]
            return AnalysisResult(verdicts, raw["model"], raw=raw)
        except (ValueError, json.JSONDecodeError) as e:
            last_err = f"invalid output: {e}"
            raw["error"] = last_err
            log.warning("vision output invalid (attempt %s): %s", attempt + 1, e)
    # Give up safely: everything uncertain, nothing changes colour.
    return AnalysisResult([Verdict(e, "uncertain", 0.0, f"Analysis failed: {last_err}") for e in ids], model,
                          raw={"error": last_err}, error=last_err)
