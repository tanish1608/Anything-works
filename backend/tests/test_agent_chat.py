import pytest
from sqlalchemy import select
from test_agent import project as project

from app.agent import provider
from app.agent.provider import DraftChat
from app.models import Element, Issue, Project, ProjectMember, User


def ask(client, p, who="worker", **changes):
    return client.post(f"/api/projects/{p['pid']}/agent/chat", headers=p[who], json={
        "input_revision": "question-1", "message": "What should I check before reporting this sink complete?",
        "page": "record", "display_context": "LOCAL SAMPLE: Sink. The worker says it is installed.", **changes})


def response(context):
    return DraftChat(message="Check connections and collect a clear photo for PM review. The saved record is not certification.",
                     source_ids=[context["server_facts"][0]["source_id"]], suggested_questions=["Which views should I capture?"])


def test_chat_uses_scoped_sources_without_progress_writes(client, db, project, monkeypatch):
    before = db.get(Element, project["element"]).status
    captured = []
    monkeypatch.setattr(provider, "chat", lambda context: (captured.append(context), response(context))[1])
    result = ask(client, project)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["status"] == "available" and body["input_revision"] == "question-1" and body["partial_context"]
    assert body["sources"][0]["kind"] == "model" and body["sources"][0]["locator"] == f"component:{project['element']}"
    assert captured[0]["untrusted_local_sample_context"].startswith("LOCAL SAMPLE")
    assert result.headers["cache-control"] == "no-store"
    db.expire_all()
    assert db.get(Element, project["element"]).status == before
    assert ask(client, project, "outsider").status_code == 404


@pytest.mark.parametrize("ids", [["local-sample-made-up-id"], ["https://unknown.invalid/source"], ["x", "x"]])
def test_chat_rejects_untrusted_citations(client, project, monkeypatch, ids):
    monkeypatch.setattr(provider, "chat", lambda context: DraftChat(message="Unsupported claim", source_ids=ids, suggested_questions=[]))
    result = ask(client, project).json()
    assert result["status"] == "unavailable" and result["sources"] == []


def test_chat_provider_failure_retains_no_fake_answer(client, project, monkeypatch):
    def fail(context):
        raise ValueError("private provider error")
    monkeypatch.setattr(provider, "chat", fail)
    result = ask(client, project).json()
    assert result["status"] == "unavailable" and "private" not in result["message"]
    assert result["sources"] == [] and result["suggested_questions"] == []


def test_chat_revalidates_model_and_membership_after_inference(client, db, project, monkeypatch):
    def change(context):
        db.get(Project, project["pid"]).current_version_id = None
        db.commit()
        return response(context)
    monkeypatch.setattr(provider, "chat", change)
    assert ask(client, project).status_code == 409
    db.get(Project, project["pid"]).current_version_id = project["version"]
    db.commit()
    def revoke(context):
        worker = db.scalar(select(User).where(User.email == "worker@example.com"))
        db.delete(db.scalar(select(ProjectMember).where(ProjectMember.project_id == project["pid"], ProjectMember.user_id == worker.id)))
        db.commit()
        return response(context)
    monkeypatch.setattr(provider, "chat", revoke)
    assert ask(client, project).status_code == 404


def test_chat_issue_author_assignee_exception_and_scope_before_limit(client, db, project, monkeypatch):
    worker = db.scalar(select(User).where(User.email == "worker@example.com"))
    for n in range(21):
        db.add(Issue(project_id=project["pid"], number=n+1, title="Private HVAC issue", description="Hidden trade note",
                     trade="hvac", zone_id=project["other_zone"]))
    visible = Issue(project_id=project["pid"], number=22, title="Assigned cross-trade issue", description="Assigned to this worker",
                    trade="hvac", zone_id=project["other_zone"], assignee_id=worker.id)
    db.add(visible)
    db.commit()
    captured = []
    def answer(context):
        captured.append(context)
        return DraftChat(message="Review your assigned issue with the PM.", source_ids=[f"issue:{visible.id}"], suggested_questions=[])
    monkeypatch.setattr(provider, "chat", answer)
    result = ask(client, project).json()
    issues = [fact for fact in captured[0]["server_facts"] if fact["source_id"].startswith("issue:")]
    assert len(issues) == 1 and issues[0]["title"] == "Assigned cross-trade issue"
    assert result["sources"][0]["kind"] == "issue" and result["sources"][0]["id"] == visible.id


@pytest.mark.parametrize("changes", [{"message": " "}, {"message": "x"*2001}, {"display_context": "x"*6001},
    {"page": "arbitrary-url"}, {"history": [{"role": "user", "text": "hello"}]*9}, {"tools": ["approve"]}])
def test_chat_rejects_unbounded_or_arbitrary_input(client, project, changes):
    assert ask(client, project, **changes).status_code == 422
