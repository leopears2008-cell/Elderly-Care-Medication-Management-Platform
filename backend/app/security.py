import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from app.config import settings

logger = logging.getLogger(__name__)

# Monkeypatch bcrypt.__about__ for passlib 1.7.4 compatibility with bcrypt >= 4.0.0
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        class _BcryptAbout:
            __version__ = getattr(bcrypt, "__version__", "4.0.0")
        bcrypt.__about__ = _BcryptAbout()
except ImportError:
    pass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

# Brute-force rate limiter: {key: (failed_count, lock_until_epoch)}
_failed_attempts: Dict[str, Tuple[int, float]] = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 900  # 15 minutes

_DEFAULT_JWT_SECRET = "change-this-32-char-secret-key-in-prod"
if settings.JWT_SECRET_KEY == _DEFAULT_JWT_SECRET:
    logger.warning(
        "JWT_SECRET_KEY is using the public default value. "
        "Set a strong JWT_SECRET_KEY environment variable before going live."
    )


def enforce_rate_limit(key: str) -> None:
    """Raise HTTP 429 while the key is locked; reset the counter once the lock expires."""
    now = time.time()
    _, lock_until = _failed_attempts.get(key, (0, 0.0))
    if lock_until > now:
        remaining = int(lock_until - now)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Passcode locked due to repeated failures. Try again in {remaining}s.",
        )
    if lock_until:
        # Lock has expired: start a fresh window instead of re-locking on the next failure.
        _failed_attempts.pop(key, None)


def register_failed_attempt(key: str) -> None:
    now = time.time()
    count, _ = _failed_attempts.get(key, (0, 0.0))
    new_count = count + 1
    lock_until = now + LOCKOUT_SECONDS if new_count >= MAX_ATTEMPTS else 0.0
    _failed_attempts[key] = (new_count, lock_until)


def clear_failed_attempts(key: str) -> None:
    _failed_attempts.pop(key, None)


def hash_passcode(passcode: str) -> str:
    try:
        return pwd_context.hash(passcode)
    except Exception:
        import bcrypt
        return bcrypt.hashpw(passcode.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_passcode(plain_passcode: str, hashed_passcode: str) -> bool:
    try:
        return pwd_context.verify(plain_passcode, hashed_passcode)
    except Exception:
        import bcrypt
        return bcrypt.checkpw(plain_passcode.encode("utf-8"), hashed_passcode.encode("utf-8"))


def _access_token_minutes() -> int:
    return int(settings.ACCESS_TOKEN_EXPIRE_MINUTES) if settings.ACCESS_TOKEN_EXPIRE_MINUTES else 480


def _encode_jwt(payload: dict) -> str:
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def create_session_jwt(profile_id: str, role: str, elder_name: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=_access_token_minutes())
    return _encode_jwt(
        {
            "profile_id": profile_id,
            "sub": profile_id,
            "role": role,
            "elder_name": elder_name,
            "exp": expire,
        }
    )


def get_current_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        return jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Care Circle passcode session.",
        ) from exc


# ── Backward compatibility helpers ───────────────────────────────────────────
security_scheme = bearer_scheme


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=_access_token_minutes())
    )
    to_encode.update({"exp": expire})
    return _encode_jwt(to_encode)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    session = get_current_session(credentials)
    user_id = session.get("sub") or session.get("profile_id")
    return {
        "user_id": user_id,
        "profile_id": session.get("profile_id", user_id),
        "email": session.get("email"),
        "role": session.get("role"),
        "elder_name": session.get("elder_name"),
    }


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
