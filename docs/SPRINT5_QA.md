# Sprint 5 — QA / offline / device audit checklist

## Offline-first (airplane mode)

1. Online: open Mini App, load exercise catalog once (caches to Dexie).
2. Enable airplane mode / DevTools → Network Offline.
3. Open **Тренировки** — catalog from cache.
4. Start workout offline → complete sets → finish.
5. Confirm local summary + sync queue counter > 0 on Home.
6. Go online → queue flushes (pending → 0).
7. **Прогресс** shows completed session (server or cache).

## Telegram Bot reminders

1. Set `BOT_TOKEN`, `BOT_USERNAME` in backend `.env`.
2. Optional Redis: `REDIS_URL` + worker:
   ```bash
   cd backend
   .venv\Scripts\arq.exe app.tasks.notifications.WorkerSettings
   ```
3. `POST /notifications/reminders` with JWT + `{ "workout_id": "..." }`.
4. Expect Telegram message with deep link `t.me/<bot>/app?startapp=workout_<id>`.
5. Without Redis/token: API returns `mode=dry_run` or `inline` fallback.

## Monitoring

- Backend: loguru JSON when `ENVIRONMENT!=development`; auth failures + 5xx logged.
- Frontend: set `VITE_SENTRY_DSN` and install `@sentry/react` for production errors.
- Analytics: `trackEvent(...)` → `Telegram.WebApp.sendData` + local buffer.

## Device UI/UX (manual)

| Check | iOS Telegram | Android Telegram |
|-------|--------------|------------------|
| Theme colors (light/dark) | ☐ | ☐ |
| Safe area / bottom nav not clipped | ☐ | ☐ |
| MainButton finish workout | ☐ | ☐ |
| Haptics on set complete / rest end | ☐ | ☐ |
| Onboarding 6 steps (incl. days/week) | ☐ | ☐ |
| Programs multi-exercise start | ☐ | ☐ |
| Offline workout complete | ☐ | ☐ |

## Automated tests

```bash
# backend
cd backend
.venv\Scripts\python.exe -m pytest -q

# frontend unit
cd frontend
npm.cmd test
npm.cmd run build

# e2e (optional)
npx playwright install chromium
npm.cmd run test:e2e
```
