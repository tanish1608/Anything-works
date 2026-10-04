"""Calls the vision model and returns validated per-element verdicts. The model is a config value
(VISION_MODEL); credentials come from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile)."""

import base64
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


def _image_block(jpeg: bytes) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                        "data": base64.standard_b64encode(jpeg).decode()}}


def build_content(photos: list[bytes], reference: bytes | None, zone: str, trade: str, note: str,
                  elements: list[dict]) -> list[dict]:
    content: list[dict] = []
    for i, p in enumerate(photos, 1):
        content += [{"type": "text", "text": f"Photo {i}:"}, _image_block(p)]
    if reference:
        content += [{"type": "text", "text": "REFERENCE (3D model render, not a photo):"}, _image_block(reference)]
    content.append({"type": "text", "text": user_text(zone, trade, note, elements, len(photos), bool(reference))})
    return content


def mode() -> str:
    s = get_settings()
    if s.vision_mode != "auto":
        return s.vision_mode
    import os

    has_creds = bool(s.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
    return "anthropic" if has_creds else "off"


def _client():
    import anthropic

    s = get_settings()
    return anthropic.Anthropic(api_key=s.anthropic_api_key) if s.anthropic_api_key else anthropic.Anthropic()


def analyze(photos: list[bytes], reference: bytes | None, *, zone: str, trade: str, note: str,
            elements: list[dict], client=None, model: str | None = None) -> AnalysisResult:
    """photos/reference: JPEG bytes (already resized). elements: dicts with id, ifc_class, name, props,
    position_hint. Raises VisionUnavailable when analysis is switched off."""
    s = get_settings()
    m = mode() if client is None else "anthropic"
    ids = [e["id"] for e in elements]
    model = model or s.vision_model
    if m == "off":
        raise VisionUnavailable("Photo analysis is off (no Anthropic credentials or VISION_MODE=off)")
    if m == "mock":
        return AnalysisResult([Verdict(e, "uncertain", 0.0, "mock analysis") for e in ids], "mock", raw={"mock": True})
    if not ids:
        return AnalysisResult([], model)
    client = client or _client()
    content = build_content(photos, reference, zone, trade, note, elements)
    kwargs: dict = {
        "model": model,
        "max_tokens": 16000,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": content}],
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": s.vision_effort, "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
    }
    if s.vision_fallbacks != "off":
        kwargs |= {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": s.vision_fallbacks}
    last_err = None
    for attempt in range(2):  # one retry on malformed output
        t = time.time()
        resp = client.beta.messages.create(**kwargs)
        raw = {"attempt": attempt + 1, "model": getattr(resp, "model", model), "stop_reason": resp.stop_reason,
               "seconds": round(time.time() - t, 2), "request_id": getattr(resp, "_request_id", None),
               "usage": {"input": getattr(resp.usage, "input_tokens", None), "output": getattr(resp.usage, "output_tokens", None)}}
        if resp.stop_reason == "refusal":
            last_err = "model declined the request"
            raw["error"] = last_err
            break
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        try:
            verdicts = validate(json.loads(text), ids)
            raw["results"] = [v.__dict__ for v in verdicts]
            return AnalysisResult(verdicts, raw["model"], raw=raw)
        except (ValueError, json.JSONDecodeError) as e:
            last_err = f"invalid output: {e}"
            raw["error"] = last_err
            log.warning("vision output invalid (attempt %s): %s", attempt + 1, e)
    # Give up safely: everything uncertain, nothing changes colour.
    return AnalysisResult([Verdict(e, "uncertain", 0.0, f"Analysis failed: {last_err}") for e in ids], model,
                          raw={"error": last_err}, error=last_err)
