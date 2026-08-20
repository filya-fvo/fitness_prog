# Инструкция для ИИ-агента: Production Upgrade

**Связанное ТЗ:** [`production-upgrade-tz.md`](./production-upgrade-tz.md)  
**Базовые документы:** [`fitness-tz.md`](../fitness-tz.md), [`instruction.md`](../instruction.md)

---

## 0. Назначение

Эта инструкция управляет доработкой MVP до production-ready состояния **после** спринтов 1–5.

Агент обязан:

1. Считать источником истины **`docs/production-upgrade-tz.md` v2.1+** (+ не противоречить `fitness-tz.md`).
2. §13 закрыт (2026-07-22): 100 exercises, external/YouTube video (no R2), `days_per_week` onboarding, cheap hosting in P2.
3. Работать итерациями (P0 → P1 → P2 → P3).
4. После каждого логического блока писать:  
   `Шаг выполнен. Жду правок или команды двигаться дальше.`

---

## 1. Критические правила

### 1.1. No hallucinations

- Не выдумывать endpoint’ы, поля БД, хостинг-решения вне ТЗ.
- Если в ТЗ дырка — **стоп и вопрос**.
- Не подменять production-деплой “ещё одним ngrok”, если пользователь просит prod.

### 1.2. Surgical changes

- Не рефакторить всё подряд “заодно”.
- Большой рефакторинг — только отдельной согласованной задачей.
- Файлы > 400 строк не раздувать; выносить компоненты/сервисы.

### 1.3. Priorities on conflict

1. Offline-first workout start/finish  
2. Security (`initData`, CORS, secrets)  
3. Multi-exercise + content correctness  
4. Media UX  
5. Deploy/ops  
6. Nice-to-have AI polish  

### 1.4. Local Windows gotchas (already known)

- `DATABASE_URL` host: **`127.0.0.1`**, not `localhost` (asyncpg/VPN).
- `.env` without UTF-8 BOM (`utf-8-sig` loader already in config).
- Prefer `npm.cmd` on PowerShell.
- Backend port convention in dev: **8001** + Vite proxy.
- Free ngrok may block VPN IPs — prod needs real domain.

---

## 2. Порядок работ (обязательный)

```
P0 Content + multi-exercise core
 → verify smoke/tests
P1 Product UI polish (programs/home/constructor)
 → verify UX path
P2 Production deploy + domain + BotFather
 → verify real Telegram login on prod URL
P3 Hardening + e2e + content expansion
```

Не прыгать в P2, если P0 не закрыт (иначе в prod будет тот же “пустой” продукт).

---

## 3. Sprint P0 — Content & multi-exercise core

### Цитировать из ТЗ

§3.1 Video, §3.2 Multi-exercise, §3.3 Exercises seed, §3.4 Programs types, §5 migrations, §6 API

### Backend tasks

1. SQL migration(s) in `supabase/migrations/`:
   - exercises: `thumbnail_url`, `media_source` (`youtube|external|none`), optional `tags`
   - programs: `workout_type`, `level`, `is_template`
   - workouts: `title`, `workout_type`, `plan jsonb`, `duration_sec`
2. Update SQLAlchemy models + Pydantic schemas.
3. Extend `POST /workouts` to accept plan/program day.
4. Add `POST /programs/{id}/start`.
5. Filters on `GET /exercises`, `GET /programs`.
6. Idempotent seed script:
   - **100** exercises
   - ≥8 programs with structure days/exercises
7. Media: YouTube/external URLs where available; else `media_source=none` + technique fallback.
8. Onboarding: persist `goals.days_per_week`.

### Frontend tasks

1. `ExerciseMediaPlayer` (YouTube iframe + `<video>` + fallback).
2. Active workout v2:
   - queue list
   - current exercise index
   - next/prev
   - sets per exercise from plan
3. Show media + technique in session.
4. Persist queue index in Dexie session.
5. Onboarding UI: `days_per_week`.
6. Analytics: `program_started`, `exercise_media_played` (if program start already wired).

### Verify

```powershell
# backend
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts\smoke_api.py

# frontend
cd C:\fitness_prog\frontend
npm.cmd test
npm.cmd run build
```

Manual: start program workout → ≥4 exercises in session → complete one full path.

### Stop condition

> Шаг выполнен. P0 готов. Жду правок или команды на P1.

---

## 4. Sprint P1 — Product polish

### Цитировать из ТЗ

§3.4 UI programs, §3.5 start scenarios, §7 frontend screens, §8 onboarding recommend

### Tasks

1. Pages: Programs catalog/details.
2. Home CTA “сегодняшняя тренировка”.
3. Constructor: multi-select + set template presets.
4. Onboarding: add `days_per_week` (if approved) + recommend programs.
5. Admin: edit media URLs + workout_type/level.
6. Empty states / loading / errors in RU.

### Verify

- UI path without admin knowledge.
- Filters workout_type work.
- Custom workout still works offline.

### Stop condition

> Шаг выполнен. P1 готов. Жду правок или команды на P2.

---

## 5. Sprint P2 — Production deploy

### Цитировать из ТЗ

§4 Production readiness, §11 DoD ops items

### Tasks (only after user chose hosting)

1. Add deploy configs (Docker and/or platform files) **according to chosen stack**.
2. Prod env examples (`backend/.env.production.example`, `frontend/.env.production.example`).
3. CI workflow: test + build + deploy.
4. Redis + Arq worker in prod.
5. Sentry FE/BE enable via env.
6. Domain HTTPS + CORS update.
7. BotFather menu button → prod front URL.
8. Run migrations + seed on prod DB.
9. Backup/restore short runbook in `docs/ops-runbook.md`.

### Verify

- Real Telegram user login on prod URL (not localhost).
- `/health` green.
- Create workout + complete on prod.
- Reminder optional (user must `/start` bot).

### Stop condition

> Шаг выполнен. P2 готов (configs/runbook). Реальный деплой на домены — по секретам пользователя.

---

## 6. Sprint P3 — Hardening

### Tasks

1. Playwright critical path updated for programs/catalog.
2. Pagination/perf: exercises page_size up to 200; catalog filters client-side.
3. Content pack expansion beyond 100 (optional — skip unless asked).
4. Security pass: CORS/JWT unit guards, prod docs off, `.env.production` gitignored.
5. Final QA checklist: `docs/SPRINT5_QA.md` + `docs/PROD_CHECKLIST.md`.

### Stop condition

> Production upgrade code complete. Device/prod URL QA remains before public launch.

---

## 7. Правила реализации multi-exercise (важно)

1. **Источник истины сессии** = `workout.plan` snapshot (не “что сейчас в каталоге”).
2. При старте из программы копировать упражнения дня в `plan`.
3. `workout_sets` пишутся с `exercise_id` + `set_number`; UI группирует по plan order.
4. Нельзя потерять offline queue при reload (Dexie session restore already exists — extend it).
5. “Одно упражнение” допустимо только для custom; templates ≥4.

---

## 8. Правила media

1. Player must not crash on null URL.
2. Prefer `animation_url` for short loop if video heavy.
3. Mute + playsInline for Telegram WebView.
4. Do not download huge media into Dexie by default.
5. Never commit binary video files into git; store only external/YouTube URLs.

---

## 9. Seed content rules

1. Russian names (`name_ru`).
2. technique + common_mistakes non-empty.
3. Programs reference exercises by stable key/name resolved at seed time.
4. Idempotent: re-run seed does not duplicate.
5. Keep a manifest for media URLs.

---

## 10. Definition of Done (agent self-check)

Перед заявлением “готово к prod” проверить по ТЗ §11:

- [ ] **100** exercises seeded
- [ ] ≥8 programs with types
- [ ] Multi-exercise session UX
- [ ] Video/animation player integrated
- [ ] Offline workout still works
- [ ] pytest + vitest + build green
- [ ] smoke_api exit 0
- [ ] Prod URL login works in Telegram
- [ ] Secrets not in git
- [ ] CORS prod-only
- [ ] Healthchecks + worker + backup notes

---

## 11. Формат ответа агента

1. Кратко: какой sprint/пункт ТЗ делается.
1b. **После пользовательских фиксов** — дописать секцию в [`docs/CHANGELOG.md`](./CHANGELOG.md) (версия/дата/буллеты). Не оставлять changelog устаревшим.
2. Цитата секций ТЗ.
3. Список файлов, которые будут изменены.
4. Код/миграции.
5. Команды проверки + результат.
6. Стоп-фраза ожидания.

---

## 12. Что не делать

- Не удалять offline/sync ради упрощения.
- Не хардкодить bot token / jwt / db password.
- Не заменять plan/programs “просто 4 seed exercises forever”.
- Не обещать Stars/payments без отдельного ТЗ.
- Не тащить тяжёлые админ-фреймворки без запроса.

---

## 13. Быстрые команды проекта (local)

```powershell
# API
cd C:\fitness_prog\backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001

# Web
cd C:\fitness_prog\frontend
npm.cmd run dev -- --host 0.0.0.0 --port 5173

# Smoke
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\smoke_api.py
```

---

**Конец инструкции**
