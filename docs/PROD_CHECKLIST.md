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
- [ ] BotFather → Login Widget: Allowed URL `https://app.filfitclub.ru`, подпись `RS256`
- [ ] Browser Telegram Login verifies JWKS, issuer, audience and nonce; phone scope is not requested
- [ ] AI rate limit uses Redis in prod (`REDIS_URL`)
- [ ] Dependency audit periodically (`pip` / `npm audit`)

## Deploy / ops

- [ ] Timeweb App Platform follows [TIMEWEB_DOMAIN_CUTOVER.md](./TIMEWEB_DOMAIN_CUTOVER.md)
- [ ] One replica uses the root `Dockerfile`, port 8000 and health path `/health`
- [ ] `https://app.filfitclub.ru` and `/health` return 200
- [ ] PostgreSQL 18 and Valkey use protected public connections (TLS)
- [ ] Timeweb extensions `pgvector`, `pg_trgm`, `pgcrypto`, `uuid-ossp` are enabled
- [ ] Logs show validation and migrations completed before API/worker
- [ ] Versioned exercise/program/nutrition seed completed
- [ ] ARQ worker is running
- [ ] Timeweb PostgreSQL backup is enabled; local dump is retained
- [ ] Domain NS point only to Timeweb; Cloudflare zone/tunnel no longer serves traffic
- [ ] Telegram Menu Button has type `web_app` and opens `https://app.filfitclub.ru`
- [ ] Local Supervisor/Tailscale remains available for the first 24 hours
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
healthcheck в Timeweb. Локальный Supervisor не управляет production и остаётся
отдельным резервным контуром.

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
- Prod health URL:
- Notes:
