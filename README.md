# Fitness Mini App

Русскоязычное Telegram Mini App и браузерное PWA для тренировок, питания,
восстановления и замеров. Интерфейс поддерживает email OTP, Telegram `initData`,
офлайн-восстановление активной тренировки и отложенную синхронизацию.

## Стек и структура

```text
frontend/   React 18 + TypeScript + Vite + Tailwind + Dexie/PWA
backend/    FastAPI + SQLAlchemy async + ARQ/Redis + Groq
supabase/   последовательные PostgreSQL-миграции
scripts/    запуск Windows, supervisor, Tailscale, Redis, миграции
docs/       пользовательские, административные и QA-документы
```

Агенту перед изменениями: [AGENTS.md](AGENTS.md). Пользователю:
[docs/USER_GUIDE.md](docs/USER_GUIDE.md). Администратору:
[docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md).

Исторические планы и одноразовые скрипты, не участвующие в приложении, вынесены
в `_archive_candidates/` и не являются источником требований.

## Запуск на Windows

Первая установка на новом компьютере:

```text
install-server.cmd
install-supervisor.cmd
```

Обычная публикация единого frontend + API на `127.0.0.1:8001` через Tailscale
Funnel:

```text
start_all_comand.bat
```

Короткие команды:

```text
start-all.cmd
status.cmd
stop-all.cmd
```

Для разработки используйте `dev-local.cmd`, для возврата к опубликованной версии
— `publish-local.cmd`. Подробности: [RUN.md](RUN.md).

## Ручной запуск разработки

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001 --reload

cd ..\frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Секреты хранятся только в локальных `.env`. Образцы:
`backend/.env.example`, `backend/.env.production.example`,
`frontend/.env.example`, `frontend/.env.production.example`.

## Проверки

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .

cd ..\frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run check:bundle
npm.cmd run test:e2e
npm.cmd run audit:lighthouse
```

`audit:lighthouse` запускается после production build и требует Chrome/Chromium.
CI выполняет backend, frontend, browser/a11y/visual, bundle и Lighthouse проверки.

## Данные и интеграции

- PostgreSQL задаётся через `DATABASE_URL`; файла PostgreSQL в проекте нет.
- Redis/ARQ обслуживает фоновые уведомления и catch-up.
- Groq — единственный внешний LLM/vision provider; OpenAI fallback отсутствует.
- Open Food Facts используется для поиска продуктов по штрихкоду.
- SMTP отправляет browser OTP и обратную связь без Telegram ID.
- HealthKit/Health Connect пока не подключены; дневные показатели вводятся вручную.

## Документы

- [docs/CHANGELOG.md](docs/CHANGELOG.md) — все изменения.
- [docs/PROD_CHECKLIST.md](docs/PROD_CHECKLIST.md) — выпуск.
- [docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md](docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md) — уведомления.
- [docs/ADMIN_AI_MODEL_RUNBOOK.md](docs/ADMIN_AI_MODEL_RUNBOOK.md) — Groq.
- [docs/exercise-gifs.md](docs/exercise-gifs.md) — media pipeline.
- [docs/QA_AUDIT_2026-08-20_DEEP.md](docs/QA_AUDIT_2026-08-20_DEEP.md) — последний глубокий аудит.
