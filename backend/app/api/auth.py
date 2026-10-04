from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.security import decode_token, encode_token, hash_password, verify_password
from app.config import get_settings
from app.db import get_db
from app.models import Organization, OrgMembership, RefreshToken, User, new_id
from app.schemas import LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.services import events

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(db: Session, user: User, family_id: str | None = None) -> TokenPair:
    s = get_settings()
    rt = RefreshToken(
        id=new_id(),
        user_id=user.id,
        family_id=family_id or new_id(),
        expires_at=datetime.now(UTC) + timedelta(days=s.refresh_token_days),
    )
    db.add(rt)
    return TokenPair(
        access_token=encode_token(user.id, "access", timedelta(minutes=s.access_token_minutes)),
        refresh_token=encode_token(user.id, "refresh", timedelta(days=s.refresh_token_days), jti=rt.id),
    )


@router.post("/register", response_model=TokenPair, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(id=new_id(), email=email, name=body.name, password_hash=hash_password(body.password))
    org = Organization(id=new_id(), name=body.org_name or f"{body.name}'s company")
    db.add_all([user, org])
    db.flush()
    db.add(OrgMembership(org_id=org.id, user_id=user.id, is_admin=True))
    events.record(db, project_id=None, actor_id=user.id, type="user.registered", entity_type="user",
                  entity_id=user.id)
    tokens = _issue(db, user)
    db.commit()
    return tokens


@router.post("/login", response_model=TokenPair)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    tokens = _issue(db, user)
    db.commit()
    return tokens


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    """Rotate: the presented refresh token is revoked and a new pair issued. Re-use of a revoked
    token (a sign it was stolen) revokes the whole token family."""
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None
    rt = db.get(RefreshToken, payload.get("jti"))
    if rt is None or rt.user_id != payload["sub"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    now = datetime.now(UTC)
    if rt.revoked_at is not None:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reused; please log in again")
    rt.revoked_at = now
    user = db.get(User, rt.user_id)
    tokens = _issue(db, user, family_id=rt.family_id)
    db.commit()
    return tokens


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        return
    rt = db.get(RefreshToken, payload.get("jti"))
    if rt:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
