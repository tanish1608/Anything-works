import json
import uuid
from types import SimpleNamespace

import pytest
from tests_helpers import jpeg, login

from app.config import get_settings
from app.seed import seed
from app.vision import client as vision
from app.vision.prompt import OUTPUT_SCHEMA


class FakeClient:
    """Stands in for google.genai.Client(): records the request, returns canned outputs in order."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, **kw):
        self.calls.append(kw)
        out = self.outputs.pop(0)
        finish = SimpleNamespace(name="SAFETY" if out == "REFUSE" else "STOP")
        text = None if out == "REFUSE" else out if isinstance(out, str) else json.dumps(out)
        return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=finish)], text=text, prompt_feedback=None,
                               model_version=kw["model"], response_id="resp_test",
                               usage_metadata=SimpleNamespace(prompt_token_count=1000, candidates_token_count=200,
                                                              thoughts_token_count=50))


@pytest.fixture
def demo(db, client, monkeypatch):
    monkeypatch.setattr(get_settings(), "vision_mode", "gemini")
    p = seed(db)
    pm, plumber = login(client, "pm@example.com"), login(client, "plumber@example.com")
    zones = {z["name"]: z["id"] for b in client.get(f"/api/projects/{p.id}/tree", headers=pm).json()
             for lv in b["levels"] for z in lv["zones"]}
    return {"pid": p.id, "pm": pm, "plumber": plumber, "owner": login(client, "owner@example.com"), "zones": zones}


def run_upload(client, demo, fake, monkeypatch, claimed=()):
    monkeypatch.setattr(vision, "_client", lambda: fake)
    bath = demo["zones"]["UNIT 101 BATH"]
    r = client.post(f"/api/projects/{demo['pid']}/uploads", headers=demo["plumber"],
                    data={"zone_id": bath, "trade": "plumbing", "client_uuid": str(uuid.uuid4()),
                          "element_ids": json.dumps(list(claimed))},
                    files=[("files", ("a.jpg", jpeg(11), "image/jpeg")), ("reference", ("ref.jpg", jpeg(12), "image/jpeg"))])
    assert r.status_code == 201, r.text
    return r.json()


def checklist(client, demo):
    return client.get(f"/api/zones/{demo['zones']['UNIT 101 BATH']}/checklist", headers=demo["plumber"]).json()["items"]


def test_brief_example_five_verified_one_missed(client, demo, monkeypatch):
    items = checklist(client, demo)
    pipes = [i for i in items if i["ifc_class"] == "IfcPipeSegment"][:6]
    others = [i for i in items if i not in pipes]
    results = [{"element_id": p["id"], "verdict": "installed", "confidence": 0.95, "reason": "visible in photo 1"} for p in pipes[:5]]
    results.append({"element_id": pipes[5]["id"], "verdict": "missing", "confidence": 0.9, "reason": "wall bay empty"})
    results += [{"element_id": o["id"], "verdict": "not_visible", "confidence": 0.8, "reason": "out of frame"} for o in others]
    fake = FakeClient([{"results": results}])
    up = run_upload(client, demo, fake, monkeypatch)

    # Request shape: configured model, strict JSON schema, photo + reference images, every element listed.
    kw = fake.calls[0]
    assert kw["model"] == get_settings().vision_model
    cfg = kw["config"]
    assert cfg.response_mime_type == "application/json" and cfg.response_json_schema == OUTPUT_SCHEMA
    assert cfg.thinking_config.thinking_level.name == get_settings().vision_effort.upper()
    contents = kw["contents"]
    assert sum(1 for c in contents if getattr(c, "inline_data", None)) == 2
    assert all(p["id"] in contents[-1] for p in pipes)

    els = {e["id"]: e for e in checklist(client, demo)}
    assert [els[p["id"]]["status"] for p in pipes[:5]] == ["needs_review"] * 5  # amber until a PM approves
    missed = els[pipes[5]["id"]]
    assert missed["status"] == "not_started" and "possibly_missed" in missed["flags"]
    assert all("retake_photo" in els[o["id"]]["flags"] for o in others)
    u = client.get(f"/api/uploads/{up['id']}", headers=demo["pm"]).json()
    assert u["analysis_status"] == "done"
    kinds = {n["kind"] for n in client.get("/api/notifications", headers=demo["plumber"]).json()}
    assert {"progress.possibly_missed", "progress.retake"} <= kinds
    # PM approves AI claims → green, with the upload's photos as evidence.
    ai = [v for v in u["verifications"] if v["source"] == "ai" and v["state"] == "proposed"]
    assert len(ai) == 5
    client.post(f"/api/uploads/{up['id']}/approve-all", json={}, headers=demo["pm"])
    els = {e["id"]: e for e in checklist(client, demo)}
    assert [els[p["id"]]["status"] for p in pipes[:5]] == ["done"] * 5


def test_auto_approve_mode_and_threshold(client, demo, monkeypatch):
    # PMs can't enable auto-approval; owners can.
    assert client.patch(f"/api/projects/{demo['pid']}", json={"settings": {"approval_mode": "auto"}},
                        headers=demo["pm"]).status_code == 403
    r = client.patch(f"/api/projects/{demo['pid']}", json={"settings": {"approval_mode": "auto", "confidence_threshold": 0.9}},
                     headers=demo["owner"])
    assert r.json()["settings"]["approval_mode"] == "auto"
    pipes = [i for i in checklist(client, demo) if i["ifc_class"] == "IfcPipeSegment"][:3]
    fake = FakeClient([{"results": [
        {"element_id": pipes[0]["id"], "verdict": "installed", "confidence": 0.97, "reason": "clear"},
        {"element_id": pipes[1]["id"], "verdict": "installed", "confidence": 0.7, "reason": "partly hidden"},
    ]}])  # pipes[2] omitted by the model → uncertain
    run_upload(client, demo, fake, monkeypatch)
    els = {e["id"]: e for e in checklist(client, demo)}
    assert els[pipes[0]["id"]]["status"] == "done"  # auto-approved, evidence = this upload
    assert els[pipes[1]["id"]]["status"] == "not_started" and "retake_photo" in els[pipes[1]["id"]]["flags"]
    assert els[pipes[2]["id"]]["status"] == "not_started" and "retake_photo" in els[pipes[2]["id"]]["flags"]


def test_invalid_output_retries_then_fails_safe(client, demo, monkeypatch):
    fake = FakeClient(["not json", {"oops": 1}])
    up = run_upload(client, demo, fake, monkeypatch)
    assert len(fake.calls) == 2
    u = client.get(f"/api/uploads/{up['id']}", headers=demo["pm"]).json()
    assert u["analysis_status"] == "failed"
    assert all(e["status"] == "not_started" for e in checklist(client, demo))  # nothing changed colour


def test_refusal_is_safe(client, demo, monkeypatch):
    up = run_upload(client, demo, FakeClient(["REFUSE"]), monkeypatch)
    assert client.get(f"/api/uploads/{up['id']}", headers=demo["pm"]).json()["analysis_status"] == "failed"


def test_worker_disputes_ai_and_manager_overrides(client, demo, monkeypatch):
    pipe = [i for i in checklist(client, demo) if i["ifc_class"] == "IfcPipeSegment"][0]
    fake = FakeClient([{"results": [{"element_id": pipe["id"], "verdict": "missing", "confidence": 0.8, "reason": "not seen"}]}])
    up = run_upload(client, demo, fake, monkeypatch)
    ai = next(v for v in client.get(f"/api/uploads/{up['id']}", headers=demo["pm"]).json()["verifications"]
              if v["source"] == "ai" and v["element_id"] == pipe["id"])
    assert client.post(f"/api/verifications/{ai['id']}/override", json={"verdict": "installed", "reason": ""},
                       headers=demo["plumber"]).status_code == 422
    w = client.post(f"/api/verifications/{ai['id']}/override", json={"verdict": "installed", "reason": "It's behind the tub, see photo 1"},
                    headers=demo["plumber"]).json()
    assert w["source"] == "worker" and w["state"] == "proposed"
    assert next(e for e in checklist(client, demo) if e["id"] == pipe["id"])["status"] == "needs_review"
    m = client.post(f"/api/verifications/{w['id']}/override", json={"verdict": "installed", "reason": "Checked on site walk"},
                    headers=demo["pm"]).json()
    assert m["source"] == "manager"
    assert next(e for e in checklist(client, demo) if e["id"] == pipe["id"])["status"] == "done"


def test_vision_off_without_credentials(client, demo, monkeypatch):
    monkeypatch.setattr(get_settings(), "vision_mode", "auto")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setattr(get_settings(), "gemini_api_key", "")
    bath = demo["zones"]["UNIT 101 BATH"]
    r = client.post(f"/api/projects/{demo['pid']}/uploads", headers=demo["plumber"],
                    data={"zone_id": bath, "trade": "plumbing", "client_uuid": "x1"},
                    files=[("files", ("a.jpg", jpeg(13), "image/jpeg"))])
    assert r.json()["analysis_status"] == "off"


def test_validate_unit():
    v = vision.validate({"results": [
        {"element_id": "a", "verdict": "installed", "confidence": 1.7, "reason": "x"},
        {"element_id": "a", "verdict": "missing", "confidence": 0.9, "reason": "dup ignored"},
        {"element_id": "zzz", "verdict": "installed", "confidence": 0.9, "reason": "unknown id"},
        {"element_id": "b", "verdict": "maybe", "confidence": 0.9, "reason": "bad verdict"},
    ]}, ["a", "b"])
    assert [(x.element_id, x.verdict, x.confidence) for x in v] == [("a", "installed", 1.0), ("b", "uncertain", 0.0)]
    with pytest.raises(ValueError):
        vision.validate([1, 2], ["a"])


def test_eval_scoring_counts_false_greens():
    from app.vision.eval_vision import score

    rows = [
        {"type": "IfcPipeSegment", "truth": "installed", "verdict": "installed", "confidence": 0.95},
        {"type": "IfcPipeSegment", "truth": "missing", "verdict": "installed", "confidence": 0.9},   # false green
        {"type": "IfcPipeSegment", "truth": "installed", "verdict": "installed", "confidence": 0.6},  # below threshold
        {"type": "IfcPipeSegment", "truth": "missing", "verdict": "missing", "confidence": 0.8},
        {"type": "IfcSanitaryTerminal", "truth": "not_visible", "verdict": "not_visible", "confidence": 0.9},
    ]
    s = score(rows, 0.85)
    assert s["IfcPipeSegment"] | {} == s["IfcPipeSegment"]
    p = s["IfcPipeSegment"]
    assert (p["tp"], p["fp"], p["fn"], p["precision"], p["recall"]) == (1, 1, 1, 0.5, 0.5)
    assert p["false_greens"] == 1 and p["missing_caught"] == 1 and p["missing_total"] == 2
    assert s["ALL"]["n"] == 5 and s["IfcSanitaryTerminal"]["precision"] is None


def test_eval_harness_runs_in_mock_mode(tmp_path):
    import shutil
    from pathlib import Path

    from app.vision.eval_vision import main

    src = Path(__file__).resolve().parents[2] / "samples" / "photos"
    shutil.copytree(src / "synthetic_bath_01", tmp_path / "synthetic_bath_01")
    assert main([str(tmp_path), "--mock"]) == 0
    assert "false_greens" in (tmp_path / "RESULTS.csv").read_text()
