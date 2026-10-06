"""Project Copilot chat. Answers only; it never changes project records."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agent import chat
from app.agent.schemas import ChatCreate, ChatResult
from app.auth.deps import current_user
from app.db import get_db
from app.models import User

router = APIRouter(tags=["copilot"])


@router.post("/projects/{project_id}/copilot/chat", response_model=ChatResult)
def project_chat(project_id: str, body: ChatCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return chat.answer(db, project_id, user, body)


@router.post("/copilot/public-chat", response_model=ChatResult)
def public_chat(body: ChatCreate):
    return chat.public_answer(body)
