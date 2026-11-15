import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import get_settings
from app.security import limiter
from app.routers import auth, medications, appointments, ai_assistant

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optional APScheduler support
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()
except ImportError:
    scheduler = None

# Optional SlowAPI support
try:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    has_slowapi = True
except ImportError:
    has_slowapi = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting SushrutaCare AI backend...")
    if scheduler is not None:
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
    if scheduler is not None and getattr(scheduler, "running", False):
        scheduler.shutdown(wait=False)
    logger.info("SushrutaCare AI backend stopped")


settings = get_settings()

app = FastAPI(
    title="SushrutaCare AI",
    description="AI-powered elderly care medication management platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter setup
app.state.limiter = limiter
if has_slowapi:
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
