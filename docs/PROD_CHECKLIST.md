# Production upgrade — final checklist

Use after P0–P3 code is in place and before inviting real users.

## Content & product

- [ ] DB has **100** exercises (`seed_prod_content.py`)
- [ ] ≥8 template programs with schedule days
- [ ] Program start creates workout with **≥4** exercises in `plan`
- [ ] Active workout queue next/prev works
- [ ] YouTube/external media player does not crash without URL
- [ ] Onboarding saves `days_per_week`
- [ ] Home recommends / starts today’s session
- [ ] Catalog set templates (3×8–12 / 5×5 / 4×10 / 3×15)
- [ ] Offline start/finish still works

## Security

- [ ] No `.env` / secrets in git
- [ ] `JWT_SECRET` unique prod value (≥32 chars)
- [ ] `EMAIL_OTP_DEV_RETURN_CODE=false`; production OTP never appears in API response
- [ ] `CORS_ORIGINS` = Telegram + **only** prod front domain(s)
- [ ] `ENVIRONMENT=production` (docs disabled, JSON logs)
- [ ] initData HMAC path only for Telegram auth
- [ ] AI rate limit uses Redis in prod (`REDIS_URL`)
- [ ] Dependency audit periodically (`pip` / `npm audit`)

## Deploy / ops

- [ ] Timeweb App Platform follows [TIMEWEB_DOMAIN_CUTOVER.md](./TIMEWEB_DOMAIN_CUTOVER.md)
- [ ] One application replica uses the root `Dockerfile`, port 8000 and health path `/health`
- [ ] `https://app.filfitclub.ru` returns 200
- [ ] `https://api.filfitclub.ru/health` → `{"status":"ok"}`
- [ ] PostgreSQL 18 DBaaS and Valkey are in the same private network as the app
- [ ] PostgreSQL extensions `vector`, `pg_trgm`, `pgcrypto`, `uuid-ossp` exist
- [ ] Logs show environment validation and migrations completed before API/worker
- [ ] Versioned exercise/program/nutrition seed completed
- [ ] ARQ worker is running (if reminders are needed)
- [ ] Timeweb PostgreSQL backups are enabled and a restore has been tested
- [ ] Old Cloudflare Tunnel is disabled only after at least 24 hours of stable production
- [ ] Telegram Menu Button имеет стандартный тип `commands`/`default`, не `web_app`; inline Open из нового `/start` ведёт на prod URL
- [ ] Scheduled workflow `Public health monitor` успешно проверяет публичный `/health`
- [ ] Sentry DSN set (optional but recommended)
- [ ] Backup note/job exists ([LOCAL_ADMIN_GUIDE.md](./LOCAL_ADMIN_GUIDE.md))

## Automated

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

`npm.cmd run build` создаёт изолированную проверочную сборку `.dist-check`.
Публикация выполняется только через `npm.cmd run build:publish`; не копируйте
проверочную сборку в `dist` вручную.

После отправки production-изменения в GitHub дождитесь успешной сборки и
healthcheck в Timeweb App Platform. Локальный Windows supervisor не управляет
production.

## Manual Telegram QA

| Check | iOS | Android |
|-------|-----|---------|
| Login without 500 | ☐ | ☐ |
| Programs → start multi-ex | ☐ | ☐ |
| Complete workout → progress | ☐ | ☐ |
| Video embed / technique fallback | ☐ | ☐ |
| Offline mid-session | ☐ | ☐ |
| Theme / safe-area / bottom nav | ☐ | ☐ |

## Sign-off

- Date:
- Prod front URL:
- Prod API URL:
- Notes:
