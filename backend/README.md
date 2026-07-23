# Fitness Backend

FastAPI backend for the Telegram Mini App fitness product.

## Setup

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

## Docs

- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
