import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.security import limiter
from app.routers import auth, medications, appointments, ai_assistant

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting SushrutaCare AI backend...")
    try:
        from app.services.email_service import check_and_send_reminders
        scheduler.add_job(
            check_and_send_reminders,
            trigger="interval",
            minutes=10,
            id="medication_reminders",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — reminder job every 10 minutes")
    except Exception as e:
        logger.error(f"Scheduler startup error: {e}")
    yield
    # Shutdown
    if scheduler.running:
        scheduler.shutdown(wait=False)
    logger.info("SushrutaCare AI backend stopped")


settings = get_settings()

app = FastAPI(
    title="SushrutaCare AI",
    description="AI-powered elderly care medication management platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
    )


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "status_code": 422},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "status_code": 500},
    )


# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(medications.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(ai_assistant.router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "SushrutaCare AI", "version": "1.0.0"}
