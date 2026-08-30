# Fitness Mini App

Русскоязычное Telegram Mini App и браузерное PWA для тренировок, питания,
восстановления и замеров. Интерфейс поддерживает email OTP, Telegram `initData`,
офлайн-восстановление активной тренировки и отложенную синхронизацию.

## Стек и структура

```text
frontend/   React 18 + TypeScript + Vite + Tailwind + Dexie/PWA
backend/    FastAPI + SQLAlchemy async + ARQ/Redis + local Qwen/Tesseract
supabase/   последовательные PostgreSQL-миграции
scripts/    запуск Windows, supervisor, Tailscale, Redis, миграции
docs/       пользовательские, административные и QA-документы
```

Агенту перед изменениями: [AGENTS.md](AGENTS.md). Пользователю:
[docs/USER_GUIDE.md](docs/USER_GUIDE.md). Владельцу Timeweb VPS:
[docs/VPS_ADMIN_GUIDE.md](docs/VPS_ADMIN_GUIDE.md). Локальный Windows-резерв:
[docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md). Фактическое переключение на Timeweb:
[docs/TIMEWEB_DOMAIN_CUTOVER.md](docs/TIMEWEB_DOMAIN_CUTOVER.md). Полная первоначальная установка VPS:
[docs/VPS_DEPLOYMENT_GUIDE.md](docs/VPS_DEPLOYMENT_GUIDE.md). План развития админки:
[docs/ADMIN_PANEL_ROADMAP.md](docs/ADMIN_PANEL_ROADMAP.md).

Исторические планы и одноразовые скрипты, не участвующие в приложении, вынесены
в `_archive_candidates/` и не являются источником требований.

### Локальная карта проекта

Graphify 0.9.52 с локальным SQL-парсером строит производную AST-карту в
`graphify-out/`. Она ускоряет поиск связей между frontend, API, services, models
и миграциями, но не заменяет проверку актуального кода и тестов.

```powershell
.\scripts\install-graphify.cmd
.\scripts\graphify.cmd query "как проходит отправка уведомлений"

# Полная локальная пересборка без внешнего ИИ
.\scripts\graphify.cmd extract . --code-only --no-cluster --force
.\scripts\graphify.cmd cluster-only . --no-label
```

В Codex карта доступна через `$graphify`. Облачные backend/extras, MCP, strict,
watch и git hooks намеренно не включены; на production VPS инструмент не ставится.

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
- Qwen2.5 и Tesseract работают локально на VPS; внешнего LLM/vision API нет.
- Open Food Facts используется для поиска продуктов по штрихкоду.
- SMTP отправляет browser OTP и обратную связь без Telegram ID.
- HealthKit/Health Connect пока не подключены; дневные показатели вводятся вручную.

## Документы

- [docs/CHANGELOG.md](docs/CHANGELOG.md) — все изменения.
- [docs/PROD_CHECKLIST.md](docs/PROD_CHECKLIST.md) — выпуск.
- [docs/TIMEWEB_DOMAIN_CUTOVER.md](docs/TIMEWEB_DOMAIN_CUTOVER.md) — основной Timeweb production.
- [docs/VPS_DEPLOYMENT_GUIDE.md](docs/VPS_DEPLOYMENT_GUIDE.md) — production VPS.
- [docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md](docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md) — уведомления.
- [docs/ADMIN_AI_MODEL_RUNBOOK.md](docs/ADMIN_AI_MODEL_RUNBOOK.md) — локальные Qwen/Tesseract.
- [docs/exercise-gifs.md](docs/exercise-gifs.md) — media pipeline.
- [docs/QA_AUDIT_2026-08-20_DEEP.md](docs/QA_AUDIT_2026-08-20_DEEP.md) — последний глубокий аудит.
