"""FastAPI application entrypoint."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.sentry import init_sentry
from app.routers import admin as admin_router
from app.routers import ai as ai_router
from app.routers import auth as auth_router
from app.routers import exercises as exercises_router
from app.routers import feedback as feedback_router
from app.routers import notifications as notifications_router
from app.routers import nutrition as nutrition_router
from app.routers import programs as programs_router
from app.routers import supplements as supplements_router
from app.routers import telegram as telegram_router
from app.routers import users as users_router
from app.routers import workouts as workouts_router

settings = get_settings()
setup_logging(
    environment=settings.environment,
    service="api",
    log_dir=settings.log_dir or None,
    keep_archive_days=settings.log_archive_days,
)
init_sentry(dsn=settings.sentry_dsn, environment=settings.environment)

_docs = None if settings.environment == "production" else "/docs"
_redoc = None if settings.environment == "production" else "/redoc"

app = FastAPI(
    title="Fitness Mini App API",
    version="0.14.1",
    docs_url=_docs,
    redoc_url=_redoc,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(admin_router.router)
app.include_router(exercises_router.router)
app.include_router(programs_router.router)
app.include_router(workouts_router.router)
app.include_router(nutrition_router.router)
app.include_router(supplements_router.router)
app.include_router(ai_router.router)
app.include_router(notifications_router.router)
app.include_router(feedback_router.router)
app.include_router(telegram_router.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    if exc.status_code >= 500:
        logger.error(
            "http_5xx path={} status={} detail={}",
            request.url.path,
            exc.status_code,
            exc.detail,
        )
    elif request.url.path.startswith("/auth") and exc.status_code in {401, 403}:
        logger.warning(
            "auth_failed path={} status={} detail={}",
            request.url.path,
            exc.status_code,
            exc.detail,
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    logger.warning(
        "validation_error path={} errors={}",
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_5xx path={} err={}", request.url.path, str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by CI and local checks."""
    return {"status": "ok"}
