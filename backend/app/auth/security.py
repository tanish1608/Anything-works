from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def encode_token(sub: str, kind: str, ttl: timedelta, **extra) -> str:
    now = datetime.now(UTC)
    payload = {"sub": sub, "type": kind, "iat": now, "exp": now + ttl, **extra}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, kind: str) -> dict:
    """Raises jwt.PyJWTError on any problem (bad signature, expired, wrong type)."""
    payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    if payload.get("type") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload
