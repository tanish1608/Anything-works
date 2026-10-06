from datetime import date as Date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.agent import chat, helpers, service, voice
from app.agent.schemas import (
    ChatCreate,
    ChatResult,
    DailySummary,
    Decision,
    DecisionCreate,
    Error,
    Run,
    RunCreate,
    SuggestionCreate,
    SuggestionResult,
    SummaryRefresh,
    UUIDString,
    VoiceCorrection,
    VoiceCreate,
    VoiceNote,
)
from app.auth.deps import current_user
from app.db import SessionLocal, get_db
from app.models import AgentRun, AgentVoice, Role, Upload, User
from app.rbac import Perm, require


class AgentRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request: Request):
            try:
                response = await original(request)
            except RequestValidationError:
                response = JSONResponse(status_code=422, content={"code": "invalid_input", "message": "Invalid assessment input"})
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {
                    "code": {401: "unauthenticated", 403: "forbidden", 404: "not_found"}.get(exc.status_code, "invalid_input"),
                    "message": str(exc.detail),
                }
                response = JSONResponse(status_code=exc.status_code, content=detail, headers=exc.headers)
            response.headers["Cache-Control"] = "no-store"
            return response
        return handle


router = APIRouter(tags=["Agent"], route_class=AgentRoute,
                   responses={code: {"model": Error} for code in (401, 403, 404, 409, 422, 429)})
IdempotencyKey = Header(..., alias="Idempotency-Key", min_length=1, max_length=128)


@router.get("/projects/{project_id}/agent/runs", response_model=list[Run], operation_id="listAgentRuns")
def list_runs(project_id: UUIDString, limit: int = Query(50, ge=1, le=100),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = require(db, project_id, user.id, Perm.history_view)
    query = select(AgentRun).join(Upload, Upload.id == AgentRun.upload_id).where(AgentRun.project_id == project_id)
    if member.role == Role.trade:
        query = query.where(Upload.trade.in_(member.trades))
        if member.zone_ids is not None:
            query = query.where(Upload.zone_id.in_(member.zone_ids))
    return [service.out(db, run) for run in db.scalars(query.order_by(AgentRun.created_at.desc(), AgentRun.id).limit(limit))]


@router.post("/projects/{project_id}/agent/runs", response_model=Run, status_code=202, operation_id="createAgentRun")
def create(project_id: UUIDString, body: RunCreate, key: str = IdempotencyKey,
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = service.start(db, project_id, user.id, body, key)
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(run)
    return service.out(db, run)


@router.get("/agent/runs/{run_id}", response_model=Run, operation_id="getAgentRun")
def get(run_id: UUIDString, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return service.out(db, service.load_run(db, run_id, user.id))


@router.post("/agent/runs/{run_id}/cancel", response_model=Run, operation_id="cancelAgentRun")
def cancel(run_id: UUIDString, key: str = IdempotencyKey, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = service.load_run(db, run_id, user.id)
    service.cancel(db, run, user.id)
    db.commit()
    db.refresh(run)
    return service.out(db, run)


@router.post("/agent/actions/{action_id}/decision", response_model=Decision, operation_id="decideAgentAction")
def decide(action_id: UUIDString, body: DecisionCreate, key: str = IdempotencyKey,
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    decision = service.decide(db, action_id, user.id, body, key)
    db.commit()
    return decision


@router.post("/projects/{project_id}/agent/suggestions", response_model=SuggestionResult, operation_id="suggestAgentInput")
def suggest(project_id: UUIDString, body: SuggestionCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return helpers.suggestions(db, project_id, user.id, body)


@router.get("/projects/{project_id}/agent/summary", response_model=DailySummary, operation_id="getAgentDailySummary")
def summary(project_id: UUIDString, date: Date, timezone: str = Query(..., min_length=1, max_length=100),
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    return helpers.read_summary(db, project_id, user.id, SummaryRefresh(date=date, timezone=timezone))


@router.post("/projects/{project_id}/agent/summary/refresh", response_model=DailySummary, operation_id="refreshAgentDailySummary")
def summary_refresh(project_id: UUIDString, body: SummaryRefresh, user: User = Depends(current_user), db: Session = Depends(get_db)):
    result = helpers.refresh_summary(db, project_id, user.id, body)
    db.commit()
    return result


@router.post("/projects/{project_id}/agent/voice", response_model=VoiceNote, status_code=202, operation_id="createAgentVoice")
def voice_create(project_id: UUIDString, body: VoiceCreate, key: str = IdempotencyKey,
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    note = voice.create(db, project_id, user.id, body, key)
    db.commit()
    jobs.after_commit_run_inline(SessionLocal)
    db.refresh(note)
    return voice.out(note)


@router.get("/projects/{project_id}/agent/voice", response_model=list[VoiceNote], operation_id="listAgentVoice")
def voice_list(project_id: UUIDString, limit: int = Query(30, ge=1, le=100),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = require(db, project_id, user.id, Perm.history_view)
    query = select(AgentVoice).where(AgentVoice.project_id == project_id)
    if member.role == Role.trade:
        query = query.where(AgentVoice.trade.in_(member.trades))
        if member.zone_ids is not None:
            query = query.where(AgentVoice.zone_id.in_(member.zone_ids))
    return [voice.out(note) for note in db.scalars(query.order_by(AgentVoice.created_at.desc(), AgentVoice.id).limit(limit))]


@router.get("/agent/voice/{voice_id}", response_model=VoiceNote, operation_id="getAgentVoice")
def voice_get(voice_id: UUIDString, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return voice.out(voice.load(db, voice_id, user.id))


@router.patch("/agent/voice/{voice_id}", response_model=VoiceNote, operation_id="correctAgentVoice")
def voice_correct(voice_id: UUIDString, body: VoiceCorrection, user: User = Depends(current_user), db: Session = Depends(get_db)):
    note = voice.correct(db, voice.load(db, voice_id, user.id), user.id, body)
    db.commit()
    return voice.out(note)


_audio_content = {mime: {"schema": {"type": "string", "format": "binary"}} for mime in
                  ("application/octet-stream", "audio/wav", "audio/mpeg", "audio/m4a", "audio/mp4", "audio/ogg", "audio/webm")}


@router.get("/agent/voice/{voice_id}/file", response_class=Response, operation_id="getAgentVoiceFile",
            responses={200: {"content": _audio_content}})
def voice_file(voice_id: UUIDString, user: User = Depends(current_user), db: Session = Depends(get_db)):
    note = voice.load(db, voice_id, user.id)
    return Response(content=voice.original(note), media_type=note.mime_type, headers={"X-Content-Type-Options": "nosniff"})


@router.post("/projects/{project_id}/agent/chat", response_model=ChatResult, operation_id="answerAgentChat")
def answer_chat(project_id: UUIDString, body: ChatCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return chat.answer(db, project_id, user.id, body)


@router.post("/agent/public-chat", response_model=ChatResult, operation_id="answerPublicAgentChat")
def answer_public_chat(body: ChatCreate):
    return chat.public_answer(body)
