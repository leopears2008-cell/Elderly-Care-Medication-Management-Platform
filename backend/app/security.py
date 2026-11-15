from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import PyJWTError as JWTError
from passlib.context import CryptContext

from app.config import get_settings

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_passcode(passcode: str) -> str:
    return pwd_context.hash(passcode)


def verify_passcode(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


# ── Bearer dependency ─────────────────────────────────────────────────────────
security_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> dict:
    token = credentials.credentials
    payload = decode_token(token)
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )
    return {"user_id": user_id, "email": payload.get("email"), "role": payload.get("role")}


# ── Rate limiter (with fallback if slowapi not installed) ────────────────────
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
except ImportError:
    class _DummyLimiter:
        def limit(self, *args, **kwargs):
            return lambda fn: fn

    limiter = _DummyLimiter()

auth_limiter_key = "3/minute"
