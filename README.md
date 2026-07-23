# Fitness Telegram Mini App

Production-oriented fitness Mini App (offline-first + hybrid AI trainer).

## Structure

```
frontend/   React + Vite + TypeScript + Tailwind
backend/    Python + FastAPI
supabase/   SQL migrations (PostgreSQL + pgvector)
docs/       TZ, ops runbook, QA checklists
```

## Sources of truth

- [fitness-tz.md](fitness-tz.md) — MVP product & technical requirements
- [instruction.md](instruction.md) — original sprint workflow
- [docs/production-upgrade-tz.md](docs/production-upgrade-tz.md) — production upgrade TZ v2.1
- [docs/production-upgrade-instruction.md](docs/production-upgrade-instruction.md) — P0–P3 agent workflow
- [docs/ops-runbook.md](docs/ops-runbook.md) — deploy / backup / BotFather
- [docs/PROD_CHECKLIST.md](docs/PROD_CHECKLIST.md) — go-live checklist

## Local run

**Под рукой:** [RUN.md](RUN.md) · [scripts/dev.ps1](scripts/dev.ps1) · [scripts/dev.cmd](scripts/dev.cmd)

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
. C:\fitness_prog\scripts\dev.ps1
Start-FitnessStack
Get-FitnessStatus
Restart-Backend
# или: C:\fitness_prog\scripts\dev.cmd restart-backend
```

```powershell
# backend (port 8001 recommended on Windows)
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -e ".[dev]"
# DATABASE_URL must use 127.0.0.1 (not localhost) on Windows
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001

# seed 100 exercises + programs
.\.venv\Scripts\python.exe scripts\generate_seed_content.py
.\.venv\Scripts\python.exe scripts\seed_prod_content.py

# frontend
cd ..\frontend
npm.cmd install
npm.cmd run dev -- --host 0.0.0.0 --port 5173
```

Optional worker (reminders):

```powershell
cd backend
.\.venv\Scripts\arq.exe app.tasks.notifications.WorkerSettings
```

## Production (cheap stack)

| Piece | Suggestion |
|-------|------------|
| FE | Cloudflare Pages (free) |
| API | Render free / Railway ~$5 |
| DB | Supabase free |
| Redis | Upstash free |
| Media | YouTube/external URLs (no R2 in v1) |

Configs:

- [docker-compose.yml](docker-compose.yml) — full local/VPS stack (api + worker + web + db + redis)
- [backend/Dockerfile](backend/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile)
- [backend/.env.production.example](backend/.env.production.example)
- [frontend/.env.production.example](frontend/.env.production.example)
- [render.yaml](render.yaml) — Render blueprint starter

See [docs/ops-runbook.md](docs/ops-runbook.md).

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm.cmd test
npm.cmd run build
# optional e2e
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

## Status

- Stage 0 – Sprint 5 MVP: done
- Production upgrade **P0** (content + multi-exercise + media): done
- **P1** (programs UI, home CTA, set templates, admin media): done
- **P2** (Docker/CI/env/runbook/Sentry hook): done (wire real domains/secrets to go live)
- **P3** (hardening checklist + e2e + security tests): done (device QA remaining)
