# Fitness Backend

FastAPI backend for the Telegram Mini App fitness product.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001 --reload
```

Настройки загружаются из `backend/.env`. PostgreSQL задаётся через
`DATABASE_URL`; миграции находятся в `../supabase/migrations` и применяются
корневым `scripts/apply_migrations_local.ps1`.

## Проверки

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe scripts\smoke_api.py --help
```

Smoke read-only по умолчанию. Запись требует `--write`, внешние Telegram/Groq
вызовы — дополнительного `--external`.

## API docs

- Swagger: http://127.0.0.1:8001/docs
- ReDoc: http://127.0.0.1:8001/redoc

В `production` интерактивная документация отключена.
