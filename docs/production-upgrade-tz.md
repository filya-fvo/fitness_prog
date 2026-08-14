# ТЗ: Production Upgrade — Fitness Telegram Mini App

**Версия:** 2.1  
**Дата:** 2026-07-22  
**Статус:** Approved — implementation in progress  
**Базовое ТЗ:** [`fitness-tz.md`](../fitness-tz.md) (v1.0 MVP)  
**Инструкция агенту:** [`production-upgrade-instruction.md`](./production-upgrade-instruction.md)

### Решения заказчика (2026-07-22)

| # | Вопрос | Решение |
|---|--------|--------|
| 1 | Хостинг | **Рекомендация (free/min cost):** FE **Cloudflare Pages** (free) + API **Render free** или **Railway** (~$5) + DB **Supabase free** + Redis **Upstash free**. Альтернатива одним счётом: VPS Docker ~$4–6/мес. **Не** ngrok в prod. Финальный выбор стека — в P2. |
| 2 | Видео | **Без своего хранилища роликов.** Интеграция внешних источников (YouTube embed / HTTPS external URL). R2 — только optional later, не must-have. |
| 3 | Объём | **100 упражнений** в seed на старте. |
| 4 | Онбординг | **`days_per_week` — да.** |
| 5 | Кто снимает видео | **Никто в v1:** только внешние embed/URL, не заливка в наш bucket. |

---

## 0. Контекст

MVP (спринты 1–5) уже работает локально и через публичный HTTPS-туннель:

- Auth (Telegram `initData` + JWT)
- Каталог / активная тренировка / прогресс / offline
- Питание / AI (rule-based + optional LLM)
- Напоминания / логи / smoke-тесты

**Проблемы текущего UX/контента (подтверждены):**

1. При старте тренировки фактически ощущается как «одно упражнение» / слабый multi-exercise flow.
2. В БД мало упражнений (сейчас ~4 seed).
3. Нет нормальных **типов тренировок** и готовых **сетов/программ** (full body, split, upper/lower…).
4. Нет интеграции **видео техники** упражнений в UI.
5. Для production не хватает деплоя, секретов, мониторинга, бэкапов, стабильного HTTPS, CI/CD prod.

Этот документ описывает **что доработать**, чтобы продукт был готов к production-запуску и выглядел как полноценное фитнес-приложение, а не прототип.

---

## 1. Цели production-upgrade

### 1.1. Продуктовые цели

- Пользователь выбирает **готовую тренировку** (несколько упражнений) или собирает свою.
- В активной сессии проходит **очередь упражнений** (не одно).
- У каждого упражнения есть **видео/анимация + техника + ошибки**.
- Есть каталог **программ** разных типов (full body, split, upper/lower, push/pull/legs, cardio-mix…).
- Контент: **100 упражнений** на старте (RU), расширяемо.
- Приложение стабильно работает в Telegram 24/7 на prod-инфраструктуре.

### 1.2. Технические цели

- Деплой backend + frontend + Postgres (+ Redis) с env/secrets.
- HTTPS постоянный домен (не ephemeral tunnel).
- Миграции, seed, healthchecks, логи, Sentry, бэкапы.
- CI: test + build + deploy.
- Offline-first не ломается.

### 1.3. Вне scope (пока)

- Полноценная монетизация Telegram Stars (только задел в БД уже есть).
- Нативная админка Refine/Strapi enterprise (достаточно расширить текущий admin CRUD).
- Собственный CDN/R2-видеохостинг и видеопродакшн (v1 = только external embed/URL).
- Медицинские диагнозы / телемедицина.

---

## 2. Что уже есть (baseline)

| Область | Статус |
|--------|--------|
| Auth Telegram + JWT | ✅ |
| Exercises/Programs/Workouts API | ✅ (базово) |
| Active workout UI + rest timer + haptics | ✅ (нужен multi-exercise UX polish) |
| Offline Dexie + sync queue + PWA | ✅ |
| Progress charts/calendar/streak | ✅ |
| Nutrition + AI chat/analyze | ✅ (MVP) |
| Reminders bot + Arq | ✅ (нужен prod Redis) |
| Seed exercises | ⚠️ мало (≈4) |
| Video in UI | ⚠️ поля есть, UI/контент слабые |
| Program templates by type | ❌ |
| Production deploy | ❌ |
| Permanent domain / BotFather prod URL | ❌ |

---

## 3. Продуктовые доработки (must-have)

### 3.1. Видео выполнения упражнений

**Стратегия v1 (утверждено): external integration, не своё хранилище**

- Не храним файлы роликов у себя (R2/S3 out of scope для v1).
- В БД только **ссылки** на внешний источник.
- Плеер:
  1. **YouTube embed** (`media_source=youtube`) — основной путь
  2. **Прямой HTTPS mp4/webm** (`media_source=external`) — если есть
  3. **animation_url** (gif/webp) — optional short loop
  4. **fallback** — thumbnail/poster + текст техники (`media_source=none`)

**Требование**

- В карточке упражнения и в активной тренировке показывать медиа best-effort.
- Offline: медиа не блокирует тренировку (текст техники всегда доступен из кэша каталога).

**UI**

- `ExerciseMediaPlayer`:
  - YouTube: iframe embed (`youtube-nocookie.com`), mute optional, playsinline
  - direct video: `<video>` play/pause, mute, loop для short clips
- В Active Workout: компактный плеер над трекером текущего упражнения.
- В каталоге: thumbnail / play icon.

**Данные**

- Поля: `video_url`, `animation_url` (уже есть).
- Добавить:
  - `thumbnail_url` (text, nullable)
  - `media_duration_sec` (int, nullable)
  - `media_source` (text: `youtube` | `external` | `none`; default `none`)

**Контент**

- Seed: YouTube embed/watch URL там, где есть стабильный demo; иначе `null` + техника.
- Запрещено скачивать/перезаливать чужие ролики к себе без лицензии.
- R2 upload pipeline — **не делать в P0–P2**, только если позже отдельно решим.

### 3.2. Тренировка = несколько упражнений (session flow)

**Проблема сейчас**

- Можно выбрать несколько упражнений, но UX/навигация сессии недостаточно «как в приложении»: нет явного порядка, прогресса по упражнениям, перехода next/prev, шаблонов сетов.

**Целевой UX активной тренировки**

1. Список упражнений сессии (queue) с прогрессом `2/6`.
2. Текущее упражнение:
   - медиа + техника
   - N подходов (по умолчанию из шаблона программы/упражнения, обычно 3)
   - rest timer после подхода
3. Кнопки:
   - «Следующее упражнение»
   - «Предыдущее»
   - «+ подход»
   - «Пропустить упражнение» (optional)
   - MainButton: «Завершить тренировку»
4. Экран завершения: тоннаж, время, RPE, notes, AI one-liner.

**Правила**

- Минимум для «готовой тренировки»: **≥ 4 упражнения**.
- Пользовательский конструктор: **1…N** (N ≤ 20).
- Порядок упражнений фиксируется при создании workout instance.
- Offline: queue + sets сохраняются локально и синкаются.

**Backend (уточнение модели)**

Сейчас `workout_sets` есть, но нет явной «структуры сессии».

Добавить одно из:

**Вариант A (предпочтительный, минимальный):**  
JSONB `workouts.plan` / `workouts.structure_snapshot`:

```json
{
  "title": "Full Body A",
  "workout_type": "full_body",
  "exercises": [
    {"exercise_id": "...", "order": 1, "target_sets": 3, "target_reps": "8-12", "rest_sec": 90},
    {"exercise_id": "...", "order": 2, "target_sets": 3, "target_reps": "10-15", "rest_sec": 60}
  ]
}
```

**Вариант B:** отдельная таблица `workout_exercises(workout_id, exercise_id, order_index, target_sets, ...)`.

В ТЗ фиксируем **Вариант A для MVP-prod**, Вариант B — если понадобится сложный аналитический SQL.

### 3.3. Расширение каталога упражнений

**Объём**

- Seed **100 упражнений** (RU), сгруппированных по:
  - `muscle_group` (грудь, спина, ноги, плечи, руки, кор, кардио, мобильность)
  - `equipment` (bodyweight, dumbbells, barbell, machines, bands, kettlebell, none)
  - `difficulty` 1–5
  - tags (optional): `home`, `gym`, `beginner_safe`

**Обязательные поля контента**

- `name_ru`, `muscle_group`, `equipment`, `description`, `technique`, `common_mistakes`, `difficulty`
- `video_url` / `media_source` — external YouTube/HTTPS где возможно; иначе `none` + техника

**Админка**

- CRUD уже есть — расширить полями media + filters.

### 3.4. Типы тренировок и готовые программы

**Справочник `workout_type` (enum/text):**

| type | Описание |
|------|----------|
| `full_body` | Всё тело за сессию |
| `upper_lower` | Верх / низ (чередование дней) |
| `push_pull_legs` | PPL сплит |
| `bro_split` | Классический сплит по мышцам |
| `full_body_alt` | Full body A/B чередование |
| `home_express` | 20–30 мин дома |
| `strength` | Силовой акцент |
| `hypertrophy` | Гипертрофия 8–12 |
| `conditioning` | Кардио/метаболический |
| `mobility` | Мобильность/восстановление |
| `custom` | Пользовательская |

**Программы (programs.structure JSONB)** — обязательный контракт:

```json
{
  "workout_type": "push_pull_legs",
  "level": "beginner",
  "days_per_week": 3,
  "session_duration_min": 45,
  "schedule": [
    {
      "day_index": 1,
      "name": "Push A",
      "focus": "chest_shoulders_triceps",
      "exercises": [
        {"exercise_name": "Жим гантелей лёжа", "sets": 3, "reps": "8-12", "rest_sec": 90}
      ]
    }
  ]
}
```

**Seed программ (минимум 8):**

1. Full Body Beginner (3 дня)
2. Full Body A/B Intermediate
3. Upper/Lower 4 дня
4. Push/Pull/Legs 3 дня (beginner)
5. Push/Pull/Legs 6 дней (advanced template)
6. Home Bodyweight 3 дня
7. Strength 3 дня (базовые)
8. Mobility + Core 2–3 дня

**UI**

- Экран «Программы» (не только admin):
  - фильтр по `workout_type`, level, duration
  - карточка программы → «Начать сегодняшнюю сессию»
- Каталог упражнений остаётся для custom constructor.
- Кнопка «Начать тренировку» на Home:
  - если есть active program → стартовать next planned day
  - иначе → выбор программы / custom

### 3.5. Старт тренировки: продуктовый сценарий

**Happy path**

1. Онбординг (цель/уровень/оборудование/`days_per_week`) → рекомендация 1–2 программ.
2. Пользователь открывает программу → видит дни.
3. «Начать» создаёт `workout` со snapshot структуры (≥4 exercises).
4. Active session ведёт по упражнениям.
5. Complete → progress/streak/analytics event.

**Custom path**

1. Каталог → multi-select exercises (min 1, recommend ≥4).
2. Optional: выбрать template sets (3×8–12 / 5×5 / 4×10).
3. Start.

---

## 4. Production readiness (must-have)

### 4.1. Инфраструктура

| Компонент | Prod recommendation |
|-----------|---------------------|
| Frontend | Vercel / Cloudflare Pages / Nginx static |
| Backend | Railway / Render / Fly.io / VPS Docker |
| DB | Supabase Postgres **или** managed Postgres |
| Redis | Upstash / managed Redis (rate limit + Arq) |
| Media | **External URLs / YouTube embed** (no own video bucket in v1) |
| Domain | `app.example.com` (front), `api.example.com` (back) |
| Tunnel | только для dev; **не** для prod |

### 4.2. Конфиги и секреты

- Никаких секретов в git.
- Prod env:
  - `DATABASE_URL` (pooler, sslmode)
  - `BOT_TOKEN`, `BOT_USERNAME`
  - `JWT_SECRET` (≥32 random bytes)
  - `CORS_ORIGINS` = `https://web.telegram.org,https://app.example.com`
  - `REDIS_URL`
  - `AI_PROVIDER=groq`
  - `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODELS` (Groq и каскад моделей)
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (optional fallback; OpenAI Platform API, не подписка ChatGPT)
  - `SENTRY_DSN` (front+back)
  - (optional later) `R2_*` keys — not required in v1
  - `ENVIRONMENT=production`
- Frontend:
  - `VITE_API_URL=https://api.example.com`
  - `VITE_SENTRY_DSN=...`
  - `VITE_BOT_USERNAME=...`

### 4.3. Backend prod checklist

- [ ] `ENVIRONMENT=production` → JSON logs, no SQL echo
- [ ] HTTPS only
- [ ] CORS strict
- [ ] DB migrations applied (Supabase or script)
- [ ] Seed content applied (exercises/programs/products)
- [ ] `/health` used by platform healthcheck
- [ ] Uvicorn/gunicorn workers behind reverse proxy
- [ ] Arq worker process running
- [ ] Sentry backend (optional but recommended)
- [ ] Rate limit AI via Redis (not memory-only)
- [ ] Backup Postgres daily

### 4.4. Frontend prod checklist

- [ ] Production build (`npm run build`)
- [ ] Correct `VITE_API_URL`
- [ ] PWA/SW не кэширует API
- [ ] Sentry enabled
- [ ] Telegram theme/safe-area проверены iOS/Android
- [ ] BotFather Menu Button = prod front URL
- [ ] Deep links `startapp=workout_<id>` работают на prod domain

### 4.5. CI/CD

GitHub Actions:

1. `pytest`
2. `npm test` + `npm run build`
3. deploy backend + frontend on `main` (manual approve optional)

### 4.6. Observability & ops

- Structured logs (уже loguru)
- Sentry FE/BE
- Uptime check `/health`
- Alert on 5xx spike
- Runbook: restart api/worker, re-seed, rotate secrets

### 4.7. Security

- initData HMAC only trusted path for auth
- JWT expiry 30d ok for TMA; consider refresh later
- No PII in client logs
- Validate all payloads (Pydantic/Zod)
- Upload media only via signed/admin path (no public arbitrary upload in MVP-prod)
- Dependency audit periodically

### 4.8. Performance

- Paginate exercises/programs
- Cache exercise catalog client-side (Dexie already)
- Media lazy-load
- Avoid N+1 on workout history (selectinload already)

---

## 5. Данные и миграции

### 5.1. Новые/расширенные поля

**exercises**

- `thumbnail_url text null`
- `media_source text not null default 'none'`  -- youtube|external|none
- `secondary_muscles text[]/jsonb null` (optional)
- `tags jsonb default []` (optional)

**programs**

- `workout_type text not null default 'custom'`
- `level text null` (beginner/intermediate/advanced)
- `is_template boolean default true`
- index on `(workout_type, target_level)`

**workouts**

- `title text null`
- `workout_type text null`
- `plan jsonb not null default '{}'` (structure snapshot)
- `duration_sec int null` (filled on complete)

### 5.2. Seed packs

Файлы:

- `backend/scripts/seed_content/exercises.json`
- `backend/scripts/seed_content/programs.json`
- `backend/scripts/seed_content/media_manifest.json`
- `backend/scripts/seed_prod_content.py`

Идемпотентный seed (upsert by `name_ru` / slug).

---

## 6. API changes (additive, backward-compatible where possible)

### 6.1. Exercises

- `GET /exercises` filters: `muscle_group`, `equipment`, `q`, `tag`, pagination
- `GET /exercises/{id}` includes media fields

### 6.2. Programs

- `GET /programs?workout_type=&level=`
- `GET /programs/{id}`
- `POST /programs/{id}/start` → creates workout from today’s/next day template  
  Body optional: `{ "day_index": 1 }`

### 6.3. Workouts

- `POST /workouts` accepts:
  - `exercise_ids[]` **or**
  - `program_id` + `day_index` **or**
  - full `plan`
- Response includes `plan`, `title`, `workout_type`
- `PUT /workouts/{id}/complete` writes `duration_sec` if started_at known

### 6.4. Admin

- Extend admin UI for media URLs + program structure editor (JSON form simple first).

---

## 7. Frontend changes

### 7.1. New/extended screens

| Screen | Purpose |
|--------|---------|
| Programs catalog | Browse templates by type |
| Program details | Days + start |
| Exercise details | Media + technique |
| Active workout v2 | Multi-exercise queue UX |
| Workout constructor | Multi-select + template sets |
| Home v2 | Today’s planned session CTA |

### 7.2. Components

- `ExerciseMediaPlayer`
- `WorkoutQueueList`
- `SetTracker` (per exercise)
- `ProgramCard`
- `TypeFilterChips`

### 7.3. State

- `workoutStore`:
  - `currentExerciseIndex`
  - `plan`
  - helpers next/prev exercise
- Persist index in Dexie session

### 7.4. Analytics events (add)

- `program_opened`
- `program_started`
- `exercise_media_played`
- `workout_exercise_completed`

---

## 8. AI / onboarding upgrades (should-have for prod polish)

- После онбординга: rule-based подбор программы по:
  - goal (lose/gain/maintain)
  - level
  - equipment
  - days_per_week (добавить вопрос в onboarding)
- AI chat RAG должен видеть расширенный каталог.
- Не требовать LLM для core path.

---

## 9. Тестирование (обязательно перед prod)

### 9.1. Automated

- pytest: create workout from program plan (≥4 exercises), complete flow, KBJU, initData, schedule shift
- vitest: queue navigation, formatters, store multi-exercise
- smoke_api extended: programs start + media fields present
- playwright:  
  Programs → Start → complete 1 set on ex1 → next exercise → finish

### 9.2. Manual QA

- iOS Telegram + Android Telegram
- Slow network / offline mid-workout
- Video autoplay policies (muted loop)
- Bot reminder deep link on prod domain
- CORS only prod origins

### 9.3. Content QA

- No empty technique for seeded exercises
- Program days reference existing exercises
- RU naming consistency

---

## 10. План внедрения (спринты upgrade)

### Sprint P0 — Content & multi-exercise core (priority)

1. Migrations: program/workout/exercise fields
2. Seed **100** exercises + 8 programs
3. Backend start-from-program + plan snapshot
4. Active workout v2 queue UX
5. Media player (YouTube/external) + bind URLs
6. Onboarding field `days_per_week`

**DoD:** из программы стартует тренировка на 4+ упражнений с video embed/fallback.

### Sprint P1 — Product polish

1. Programs UI + filters
2. Home “today session”
3. Constructor templates (3×8–12 etc.)
4. Admin media fields
5. Onboarding → program recommend

### Sprint P2 — Production deploy

1. Docker compose / platform configs
2. Prod env + secrets
3. Domain + BotFather
4. Redis worker prod
5. Sentry + uptime + backups
6. CI deploy

### Sprint P3 — Hardening

1. Performance/pagination
2. E2E full path
3. Content expansion beyond 100 (optional)
4. Optional LLM prod key + budgets

---

## 11. Критерии готовности к production (Definition of Done)

Продукт можно объявлять production-ready, когда:

1. **Контент:** **100** exercises, ≥8 programs, types covered.
2. **UX:** start from program → multi-exercise session → complete → visible in progress.
3. **Media:** player works; missing media doesn’t break session.
4. **Offline:** start/finish workout offline, sync later.
5. **Security:** initData verified; CORS prod-only; secrets not in repo.
6. **Deploy:** public HTTPS front+api stable (not ngrok-only).
7. **Ops:** healthchecks green; logs; backup plan documented.
8. **Tests:** unit+smoke green in CI; critical e2e path green.
9. **Telegram:** Menu Button points to prod; real user can login without 500.

---

## 12. Риски и решения

| Риск | Решение |
|------|---------|
| Нет своих видео | YouTube/external embed + text fallback; без R2 в v1 |
| VPN/tunnel instability | permanent domain hosting |
| asyncpg localhost on Windows | always `127.0.0.1` in local docs; prod uses platform host |
| LLM cost | OpenAI `gpt-5-nano`; rule-based fallback; Redis rate limit 20/day by default |
| Over-scoping admin | JSON editor first, visual builder later |
| Content quality | seed review checklist before prod |

---

## 13. Открытые вопросы

### Закрыто (2026-07-22)

1. **Хостинг:** рекомендация зафиксирована в шапке (CF Pages + Supabase + Render/Railway/Upstash; VPS optional). Точный провайдер API выбираем в **P2**.
2. **Видео:** external/YouTube integration, **без** своего video storage.
3. **Объём:** **100** упражнений.
4. **days_per_week в онбординге:** **да**.
5. **Ролики:** не готовим/не заливаем; только embed/URL.

### Ещё можно уточнить позже (не блокирует P0)

- Бренд/app title для store-like UI
- Точный API-хост в P2 (Render vs Railway vs VPS)
- Нужен ли отдельный provider API (например ExerciseDB) сверх YouTube URL в seed

---

## 14. Приоритет реализации (рекомендация)

**Сначала (блокирует “похоже на продукт”):**

1. Multi-exercise session UX + plan snapshot  
2. Seed exercises/programs by type  
3. Video player integration  

**Потом (блокирует “можно в прод 24/7”):**

4. Permanent deploy + domain + BotFather  
5. Redis/worker/Sentry/backups  
6. CI deploy  

---

## 15. Приложение A — минимальный список мышечных групп и оборудования

**muscle_group:** `chest`, `back`, `legs`, `glutes`, `shoulders`, `biceps`, `triceps`, `core`, `cardio`, `full_body`, `mobility`  
(в UI — русские лейблы)

**equipment:** `bodyweight`, `dumbbells`, `barbell`, `kettlebell`, `bands`, `machine`, `cable`, `bench`, `pullup_bar`, `none`

---

## 16. Приложение B — пример ready workout (Full Body A)

1. Приседания (goblet/bodyweight) 3×10  
2. Отжимания 3×8–12  
3. Тяга (гантель/резинка) 3×10  
4. Планка 3×30–40с  
5. Hip hinge / румынская тяга 3×10  
6. Face pull / band pull-apart 3×12  

---

**Конец ТЗ v2.0**

После утверждения этого файла реализация идёт строго по [`production-upgrade-instruction.md`](./production-upgrade-instruction.md).
