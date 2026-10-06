"""Review-only AI checks on received work updates, with a fake provider (no live model calls)."""
import pytest
from sqlalchemy import select
from test_shared_workflow import (
    current,
    decide,
    site,  # noqa: F401 - shared fixture
    submit,
)

from app.agent import assessment as ai_check
from app.agent import provider
from app.agent.schemas import Assessment
from app.config import get_settings
from app.models import WorkAssessment

calls: list[dict] = []


@pytest.fixture
def agent(monkeypatch):
    monkeypatch.setattr(get_settings(), "agent_enabled", True)
    monkeypatch.setattr(ai_check.vision, "mode", lambda: "gemini")
    calls.clear()

    def fake(outcome, *, cite=True, element=None):
        def assess(context, photos):
            calls.append(context)
            target = element or context["elements"][0]["id"]
            return Assessment.model_validate({"observations": [{
                "element_id": target, "outcome": outcome, "observation": f"Model says {outcome}",
                "evidence_ids": [photos[0][0]] if cite else [], "limitations": ["Connection is partly hidden"]}]}), \
                {"model": "fake-gemini", "seconds": 0.1}
        monkeypatch.setattr(provider, "assess", assess)
    return fake


def latest_job(api, site_):
    return current(api, site_)["state"]["assessmentJobs"][0]


def test_pass_is_a_suggestion_and_never_completes_work(api, db, site, agent):  # noqa: F811
    agent("pass")
    assert submit(api, site).status_code == 201
    job = latest_job(api, site)
    assert job["state"] == "ai_suggested"
    assert job["ai"]["suggestion"] == {"outcome": "pass", "decision": "accept", "reason": "Model says pass"}
    assert job["ai"]["checks"][0]["completion_eligible"] is False
    assert job["ai"]["promptVersion"] and job["ai"]["policyVersion"] == "review-only-v1"
    # The model only saw approved context: the component, location and photos; never instructions.
    context = calls[0]
    assert context["elements"][0]["id"] == site["work"]["location"]["elements"][0]
    assert context["correction_of_issue"] is None and len(context["photos"]) == 1
    state = current(api, site)["state"]
    item = state["items"][0]
    assert item["status"] == "review" and item["progress"] == "Not assessed"
    assert any(e["actor"] == "Placeholder AI · suggestion" for e in state["events"])
    accepted = decide(api, site, item, "accept", assessment_id=job["ai"]["id"])
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "human"
    texts = [e["text"] for e in current(api, site)["state"]["events"]]
    assert any("after reviewing AI check" in t for t in texts)


def test_correction_still_showing_problem_suggests_returning_it(api, db, site, agent):  # noqa: F811
    agent("potential_discrepancy")
    assert submit(api, site).status_code == 201
    item = current(api, site)["state"]["items"][0]
    first = latest_job(api, site)["ai"]
    assert first["suggestion"]["decision"] == "confirm"
    confirmed = decide(api, site, item, "confirm", assignee_id=site["payload"]["assignee_id"], due="2026-10-09",
                       assessment_id=first["id"])
    assert confirmed.status_code == 200, confirmed.text
    assert submit(api, site, "correction", note="Fixed the connection").status_code == 201
    assert calls[-1]["correction_of_issue"]["problem"].startswith("Reviewed the visible connection")
    job = latest_job(api, site)
    assert job["ai"]["suggestion"]["decision"] == "reject"
    assert current(api, site)["state"]["items"][0]["status"] == "issue"
    # An older run cannot be cited for the newer update.
    latest = current(api, site)["state"]["items"][0]
    assert decide(api, site, latest, "reject", assessment_id=first["id"]).status_code == 409


@pytest.mark.parametrize("kwargs", [{"cite": False}, {"element": "not-a-real-element"}])
def test_invalid_model_output_fails_closed(api, db, site, agent, kwargs):  # noqa: F811
    agent("pass", **kwargs)
    assert submit(api, site).status_code == 201
    run = db.scalar(select(WorkAssessment))
    db.refresh(run)
    assert run.status == "failed" and run.result["error"]["code"] == "analysis_failed"
    job = latest_job(api, site)
    assert job["state"] == "ai_failed"
    assert current(api, site)["state"]["items"][0]["status"] == "review"


def test_disabled_agent_keeps_manual_review(api, db, site):  # noqa: F811
    assert submit(api, site).status_code == 201
    assert latest_job(api, site)["state"] == "manual_review"
    assert db.scalar(select(WorkAssessment)) is None
