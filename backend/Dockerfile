# Production API image
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-rus \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app
COPY backend/scripts ./scripts
# Telegram /help and the admin resend action attach these canonical documents.
# Keep them in /docs because telegram_bot resolves that path inside the image.
COPY docs/USER_GUIDE.md docs/LOCAL_ADMIN_GUIDE.md /docs/

RUN pip install --upgrade pip \
    && pip install .

# Non-root
RUN useradd -m -u 10001 appuser \
    && mkdir -p /app/logs /app/data \
    && chown -R appuser:appuser /app/logs /app/data
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# Default: API. Override command for worker:
# arq app.tasks.notifications.WorkerSettings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
