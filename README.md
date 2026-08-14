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

- [fitness-tz.md](fitness-tz.md) РІР‚вЂќ MVP product & technical requirements
- [instruction.md](instruction.md) РІР‚вЂќ original sprint workflow
- [docs/production-upgrade-tz.md](docs/production-upgrade-tz.md) РІР‚вЂќ production upgrade TZ v2.1
- [docs/production-upgrade-instruction.md](docs/production-upgrade-instruction.md) РІР‚вЂќ P0РІР‚вЂњP3 agent workflow
- [docs/ops-runbook.md](docs/ops-runbook.md) РІР‚вЂќ deploy / backup / BotFather
- [docs/ADMIN_AI_MODEL_RUNBOOK.md](docs/ADMIN_AI_MODEL_RUNBOOK.md) — замена модели OpenAI, проверка и откат
- [docs/PROD_CHECKLIST.md](docs/PROD_CHECKLIST.md) РІР‚вЂќ go-live checklist

## Local run

**Р СџР С•Р В»Р Р…РЎвЂ№Р в„– Р В·Р В°Р С—РЎС“РЎРѓР С” Р С•Р Т‘Р Р…Р С•Р в„– Р С”Р Р…Р С•Р С—Р С”Р С•Р в„–:** Р Т‘Р Р†Р В°Р В¶Р Т‘РЎвЂ№ Р С”Р В»Р С‘Р С”Р Р…Р С‘ [start-all.cmd](start-all.cmd)  
Р РЃР С—Р В°РЎР‚Р С–Р В°Р В»Р С”Р В°: [RUN.md](RUN.md) Р’В· РЎРѓРЎвЂљР С•Р С—: [stop-all.cmd](stop-all.cmd) Р’В· РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓ: [status.cmd](status.cmd)  
**Changelog Р Р†Р ВµРЎР‚РЎРѓР С‘Р в„–:** [docs/CHANGELOG.md](docs/CHANGELOG.md) Р’В· GIF: [docs/exercise-gifs.md](docs/exercise-gifs.md)

```bat
C:\fitness_prog\start-all.cmd
```

Поднимает backend `:8001` + frontend `:5173` + постоянный HTTPS через Tailscale Funnel и обновляет кнопку Telegram **Open**.

Р СћР С•РЎвЂЎР ВµРЎвЂЎР Р…Р С•: [scripts/dev.cmd](scripts/dev.cmd) (`start`, `restart-backend`, `status`РІР‚В¦).

```powershell
# backend (port 8001 recommended on Windows) РІР‚вЂќ manual
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

Optional worker (reminders / notifications):

- **Full PC guide (RU):** [Р Р€Р вЂ™Р вЂўР вЂќР С›Р СљР вЂєР вЂўР СњР ВР Р‡.md](Р Р€Р вЂ™Р вЂўР вЂќР С›Р СљР вЂєР вЂўР СњР ВР Р‡.md) Р’В· [NOTIFICATIONS.md](NOTIFICATIONS.md)
- Launchers: [start-notifications.cmd](start-notifications.cmd), [status-notifications.cmd](status-notifications.cmd)

```powershell
# or double-click start-notifications.cmd
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

- [docker-compose.yml](docker-compose.yml) РІР‚вЂќ full local/VPS stack (api + worker + web + db + redis)
- [backend/Dockerfile](backend/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile)
- [backend/.env.production.example](backend/.env.production.example)
- [frontend/.env.production.example](frontend/.env.production.example)
- [render.yaml](render.yaml) РІР‚вЂќ Render blueprint starter

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

- Stage 0 РІР‚вЂњ Sprint 5 MVP: done
- Production upgrade **P0** (content + multi-exercise + media): done
- **P1** (programs UI, home CTA, set templates, admin media): done
- **P2** (Docker/CI/env/runbook/Sentry hook): done (wire real domains/secrets to go live)
- **P3** (hardening checklist + e2e + security tests): done (device QA remaining)
