# Ops runbook — Fitness Mini App (production)

## Recommended free/min-cost stack

| Piece | Service | Notes |
|-------|---------|--------|
| Frontend | **Cloudflare Pages** (free) | Build `frontend`, output `dist` |
| API | **Render free** or **Railway ~$5** | Docker from `backend/Dockerfile` |
| DB | **Supabase free** Postgres | Apply `supabase/migrations/*` |
| Redis | **Upstash free** | Rate limit + Arq worker |
| Media | External YouTube/HTTPS URLs | No R2 required in v1 |
| Tunnel | **dev only** (ngrok) | Not for prod |

Alternative single bill: **VPS + docker compose** (~$4–6/mo).

---

## 1. Secrets checklist

Set on API host (never commit):

- `DATABASE_URL` (asyncpg URL, prefer `sslmode=require` on managed PG)
- `BOT_TOKEN`, `BOT_USERNAME`
- `JWT_SECRET` (≥32 random bytes)
- `CORS_ORIGINS=https://web.telegram.org,https://YOUR_FRONT_DOMAIN`
- `REDIS_URL`
- `ENVIRONMENT=production`
- `SENTRY_DSN` (optional)

Frontend build env:

- `VITE_API_URL=https://YOUR_API_DOMAIN`
- `VITE_BOT_USERNAME=...`
- `VITE_SENTRY_DSN` (optional)

---

## 2. Database migrate + seed

### Supabase SQL editor / psql

Apply in order:

```
supabase/migrations/*.sql
```

Including P0:

```
20260722000009_production_upgrade_p0.sql
```

### Seed content (100 exercises + programs)

From a machine with network access to prod DB:

```powershell
cd backend
# point DATABASE_URL to prod (temporary shell env)
$env:DATABASE_URL="postgresql+asyncpg://..."
.\.venv\Scripts\python.exe scripts\generate_seed_content.py
.\.venv\Scripts\python.exe scripts\seed_prod_content.py
```

Or use helper:

```powershell
powershell -File scripts/prod_seed.ps1
```

Idempotent: re-run updates by `name_ru` / program `name`.

---

## 3. Deploy paths

### A) Cloudflare Pages (frontend)

1. Connect GitHub repo
2. Root: `frontend`
3. Build: `npm ci && npm run build`
4. Output: `dist`
5. Env: `VITE_API_URL`, `VITE_BOT_USERNAME`, `VITE_SENTRY_DSN`
6. Custom domain: `app.example.com`

### B) Render / Railway (API + worker)

1. Web service: Docker `backend/Dockerfile`, health `/health`
2. Worker service: same image, command  
   `arq app.tasks.notifications.WorkerSettings`
3. Attach managed Postgres **or** external Supabase URL
4. Attach Upstash Redis URL
5. Set CORS to front domain

Blueprint starter: [render.yaml](../render.yaml)

### C) Docker Compose on VPS

```bash
cp backend/.env.production.example backend/.env.production
# edit secrets
docker compose --env-file backend/.env.production up -d --build
```

Front: `http://VPS:8080` · API: `http://VPS:8000`  
Put Nginx/Caddy TLS in front for real domains.

---

## 4. Telegram BotFather

1. `/mybots` → bot → **Bot Settings** → **Menu Button**
2. URL = production frontend HTTPS, e.g. `https://app.example.com`
3. Optional: domain allow-list for Mini App
4. User must press `/start` once for reminder DMs

---

## 5. Health & smoke

```bash
curl -fsS https://api.example.com/health
# {"status":"ok"}
```

Manual Telegram path:

1. Open Mini App from Menu Button
2. Login (initData → JWT)
3. Programs → start day → complete 1 set → finish
4. Progress shows workout

---

## 6. Logs & Sentry

- API: JSON logs when `ENVIRONMENT=production` (loguru)
- Optional: `SENTRY_DSN` backend + `VITE_SENTRY_DSN` frontend
- Watch 5xx on `/auth/telegram` and `/workouts`

---

## 7. Backups

### Supabase

- Use dashboard PITR / daily backups on paid; on free export weekly:

```bash
pg_dump "$DATABASE_URL_SYNC" -Fc -f fitness_$(date +%F).dump
```

(`DATABASE_URL_SYNC` = `postgresql://` not `+asyncpg`)

### Restore

```bash
pg_restore -d "$DATABASE_URL_SYNC" --clean --if-exists fitness_YYYY-MM-DD.dump
```

### Compose volume

```bash
docker compose exec db pg_dump -U postgres fitness > backup.sql
```

---

## 8. Restart / common fixes

| Symptom | Action |
|---------|--------|
| CORS errors in Mini App | Add exact front origin to `CORS_ORIGINS` |
| Auth 500 | Check `DATABASE_URL`, DB up, migrations applied |
| Reminders silent | Worker running? Redis URL? User `/start` bot? |
| Empty catalog | Run `seed_prod_content.py` on prod DB |
| Stale FE | Hard refresh / new SW; Pages redeploy |
| ngrok offline | Expected in prod — use real domain |

---

## 9. Rollback

1. Redeploy previous image/commit on API host
2. FE: Pages rollback to previous deployment
3. DB: restore last dump if migration broke data (rare — prefer forward fix)

---

## 10. Post-deploy checklist

- [ ] `/health` 200
- [ ] Mini App opens on prod URL
- [ ] Telegram login works
- [ ] ≥1 program start → multi-exercise session
- [ ] Worker process up (if reminders needed)
- [ ] CORS prod-only
- [ ] Secrets not in git
- [ ] Backup job/note exists
