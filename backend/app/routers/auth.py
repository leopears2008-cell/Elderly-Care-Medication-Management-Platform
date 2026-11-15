from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status

from app.config import get_settings
from app.database import get_supabase
from app.schemas import Token, UserCreate, UserLogin, UserResponse
from app.security import (
    auth_limiter_key,
    create_access_token,
    get_current_user,
    hash_passcode,
    limiter,
    verify_passcode,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit(auth_limiter_key)
async def register(request: Request, body: UserCreate):
    supabase = get_supabase()

    # Check if email already exists
    existing = supabase.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    hashed = hash_passcode(body.passcode)
    result = (
        supabase.table("users")
        .insert(
            {
                "email": body.email,
                "name": body.name,
                "passcode_hash": hashed,
                "role": body.role,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")

    user = result.data[0]
    token = create_access_token(
        {"sub": user["id"], "email": user["email"], "role": user["role"]},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return Token(
        access_token=token,
        user=UserResponse(**user),
    )


@router.post("/login", response_model=Token)
@limiter.limit(auth_limiter_key)
async def login(request: Request, body: UserLogin):
    supabase = get_supabase()

    result = supabase.table("users").select("*").eq("email", body.email).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or passcode",
        )

    user = result.data[0]
    if not verify_passcode(body.passcode, user["passcode_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or passcode",
        )

    token = create_access_token(
        {"sub": user["id"], "email": user["email"], "role": user["role"]},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return Token(
        access_token=token,
        user=UserResponse(**user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = __import__("fastapi").Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("id", current_user["user_id"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**result.data[0])
