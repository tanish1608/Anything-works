"""Project Copilot chat: answers from the user's authorized work records (or a public sample's visible
records) and, when photos are attached, suggests which work item they belong to. It never changes records;
photo submission goes through the normal confirmed, idempotent update path in the app."""
import threading
import time
from collections import deque

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.agent import provider
from app.agent.prompt import CHAT_PROMPT_VERSION
from app.agent.schemas import ChatCreate, ChatResult
from app.config import get_settings
from app.models import User
from app.services import workflow as flow

MAX_WORK = 40
_public_calls: deque[float] = deque()
_public_lock = threading.Lock()


def _unavailable(body: ChatCreate, why="Copilot could not answer right now. No records were changed.") -> ChatResult:
    return ChatResult(input_revision=body.input_revision, status="unavailable", message=why,
                      suggested_questions=[], work_ids=[], sources=[], partial_context=True)


def _enabled() -> bool:
    from app.vision import client as vision

    return get_settings().agent_enabled and vision.mode() == "gemini"


def _fact(item: dict, ai: dict | None) -> dict:
    loc = item.get("location") or {}
    return {"source_id": f"work:{item['id']}", "title": item["title"][:160], "trade": item.get("trade"),
            "owner": item.get("owner"), "status": item.get("status"), "progress": item.get("progress"),
            "review": (item.get("review") or "")[:160], "due": item.get("due"), "open_issue": bool(item.get("issue")),
            "correction_submitted": bool(item.get("correction")),
            "location": " › ".join(x for x in (loc.get("levelName"), loc.get("roomName")) if x),
            "latest_ai_check": ((ai or {}).get("suggestion") or {}).get("outcome")}


def _validated(body: ChatCreate, draft, sources: set[str], candidates: list[str], public: bool) -> ChatResult:
    if (len(set(draft.source_ids)) != len(draft.source_ids) or not set(draft.source_ids) <= sources
            or (public and draft.source_ids) or not set(draft.work_ids) <= set(candidates)
            or len(set(draft.work_ids)) != len(draft.work_ids)):
        raise ValueError("Copilot cited records outside its context")
    questions = [q.strip()[:200] for q in draft.suggested_questions if q.strip()][:3]
    return ChatResult(input_revision=body.input_revision, status="available", message=draft.message.strip(),
                      suggested_questions=questions, work_ids=draft.work_ids if body.attachments else [],
                      sources=draft.source_ids, partial_context=True)


def answer(db: Session, project_id: str, user: User, body: ChatCreate) -> ChatResult:
    if not _enabled():
        return _unavailable(body, "Copilot chat is turned off on this server (AGENT_ENABLED with a Gemini key).")
    snap = flow.snapshot(db, project_id, user)  # enforces membership and trade/zone visibility
    state = snap["state"]
    ai = {j["item"]: j.get("ai") for j in reversed(state.get("assessmentJobs") or [])}
    items = sorted(state["items"], key=lambda i: (i["id"] != body.selected_work_id, not i.get("issue"),
                                                  i.get("status") not in ("review", "evidence")))[:MAX_WORK]
    candidates = [i["id"] for i in items] if snap["permissions"]["capture"] else []
    context = {
        "mode": "project_records", "prompt_version": CHAT_PROMPT_VERSION, "page": body.page,
        "you": {"name": user.name, "role": snap["role"], "can_submit_photos": snap["permissions"]["capture"],
                "can_review": snap["permissions"]["review"]},
        "selected_work_id": body.selected_work_id, "attachments": body.attachments,
        "work": [_fact(i, ai.get(i["id"])) for i in items], "candidate_work": candidates,
        "recent_events": [{"work_id": e["item"], "at": e["at"], "actor": e["actor"], "text": e["text"][:200]}
                          for e in state["events"][:12]],
        "coverage": f"{len(items)} of {len(state['items'])} visible work records; not the full project history.",
        "question": body.message, "history": [t.model_dump() for t in body.history],
    }
    db.rollback()  # no transaction held during provider I/O
    try:
        return _validated(body, provider.chat(context), {f["source_id"] for f in context["work"]}, candidates, False)
    except Exception:  # noqa: BLE001 - never expose provider details or return an unvalidated answer
        return _unavailable(body)


def public_answer(body: ChatCreate) -> ChatResult:
    """Public samples: only the browser's visible sample records are available; nothing is authenticated."""
    if not _enabled():
        return _unavailable(body, "Copilot chat is turned off on this server (AGENT_ENABLED with a Gemini key).")
    limit = get_settings().agent_public_chat_per_minute
    now = time.monotonic()
    with _public_lock:
        while _public_calls and now - _public_calls[0] > 60:
            _public_calls.popleft()
        if len(_public_calls) >= limit:
            raise HTTPException(429, "Copilot is busy; try again in a minute")
        _public_calls.append(now)
    candidates = list(dict.fromkeys(body.candidate_work_ids))
    context = {"mode": "local_sample", "prompt_version": CHAT_PROMPT_VERSION, "page": body.page,
               "local_sample_records": body.display_context, "selected_work_id": body.selected_work_id,
               "attachments": body.attachments, "candidate_work": candidates,
               "question": body.message, "history": [t.model_dump() for t in body.history]}
    try:
        return _validated(body, provider.chat(context), set(), candidates, True)
    except Exception:  # noqa: BLE001
        return _unavailable(body)
