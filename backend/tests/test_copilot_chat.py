"""Project Copilot chat with a fake provider: scoped facts, validated citations, photo routing."""
import pytest
from test_shared_workflow import (
    current,
    site,  # noqa: F401 - shared fixture
    submit,
)

from app.agent import chat as copilot
from app.agent import provider
from app.config import get_settings

seen: list[dict] = []


@pytest.fixture
def reply(monkeypatch):
    monkeypatch.setattr(get_settings(), "agent_enabled", True)
    monkeypatch.setattr("app.vision.client.mode", lambda: "gemini")
    seen.clear()

    def set_reply(**draft):
        def fake(context):
            seen.append(context)
            return provider.ChatDraft.model_validate({"message": "Here is what I found.", "source_ids": [],
                                                      "work_ids": [], "suggested_questions": [], **draft})
        monkeypatch.setattr(provider, "chat", fake)
    return set_reply


def ask(api, site_, actor="pm", **body):
    return api.c.post(f"/api/projects/{site_['pid']}/copilot/chat", headers=site_[actor],
                      json={"input_revision": "r1", "message": "What needs my attention?", **body})


def test_answers_from_scoped_work_and_validates_citations(api, site, reply):  # noqa: F811
    work = f"work:{site['work']['id']}"
    reply(source_ids=[work])
    r = ask(api, site)
    assert r.status_code == 200 and r.json()["status"] == "available" and r.json()["sources"] == [work]
    assert seen[0]["work"][0]["source_id"] == work and seen[0]["you"]["can_review"] is True
    # A trade member outside this work's trade/area sees no records, and the model cannot cite them.
    reply(source_ids=[work])
    other = ask(api, site, "other")
    assert other.json()["status"] == "unavailable"
    assert seen[-1]["work"] == [] and seen[-1]["candidate_work"] == []
    assert ask(api, site, "outsider").status_code == 404


def test_photo_routing_only_offers_work_the_user_can_submit(api, site, reply):  # noqa: F811
    wid = site["work"]["id"]
    reply(work_ids=[wid])
    r = ask(api, site, "crew", attachments=2, message="Duct connection done, photos attached")
    assert r.json()["work_ids"] == [wid]
    reply(work_ids=[wid])
    viewer = ask(api, site, "viewer", attachments=1)
    assert viewer.json()["status"] == "unavailable"  # customers cannot submit photos
    reply(work_ids=["WORK-invented"])
    assert ask(api, site, "crew", attachments=1).json()["status"] == "unavailable"


def test_chat_sees_ai_checks_and_never_changes_records(api, site, reply):  # noqa: F811
    assert submit(api, site).status_code == 201
    before = current(api, site)["state"]["items"][0]
    reply()
    assert ask(api, site).json()["status"] == "available"
    assert current(api, site)["state"]["items"][0] == before


def test_public_chat_is_off_by_default_and_rate_limited(api, reply, monkeypatch):
    body = {"input_revision": "p1", "message": "What is open?", "display_context": "{}",
            "attachments": 1, "candidate_work_ids": ["ISS-031"]}
    reply(work_ids=["ISS-031"])
    r = api.c.post("/api/copilot/public-chat", json=body)
    assert r.json()["work_ids"] == ["ISS-031"] and r.json()["sources"] == []
    reply(source_ids=["work:ISS-031"])
    assert api.c.post("/api/copilot/public-chat", json=body).json()["status"] == "unavailable"
    monkeypatch.setattr(get_settings(), "agent_public_chat_per_minute", 0)
    assert api.c.post("/api/copilot/public-chat", json=body).status_code == 429
    monkeypatch.setattr(get_settings(), "agent_enabled", False)
    copilot._public_calls.clear()
    assert api.c.post("/api/copilot/public-chat", json=body).json()["status"] == "unavailable"
