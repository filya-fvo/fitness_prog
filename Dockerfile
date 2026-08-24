# Timeweb App Platform: one public container for React, FastAPI and ARQ.
FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

# The Timeweb image serves API and SPA from the same origin. VITE_* values are
# public build-time settings and must never contain secrets.
ARG VITE_SENTRY_DSN=""
ARG VITE_BOT_USERNAME=""
ENV VITE_API_URL="" \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_BOT_USERNAME=$VITE_BOT_USERNAME
RUN npm run build:publish


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production \
    LOG_DIR=/app/logs

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app
COPY backend/scripts ./scripts
COPY supabase/migrations ./supabase/migrations
COPY deploy/timeweb/run_api_and_worker.py ./run_api_and_worker.py
COPY deploy/timeweb/start.sh ./start.sh
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

RUN pip install --upgrade pip \
    && pip install . \
    && chmod 755 /app/start.sh \
    && useradd -m -u 10001 appuser \
    && mkdir -p /app/logs /app/data \
    && chown -R appuser:appuser /app/logs /app/data

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["/app/start.sh"]
