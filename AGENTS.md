# AGENTS.md — карта и правила Fitness Mini App

Обновлено: 2026-08-25. Этот файл — первая точка входа для любого агента,
который меняет проект. Он описывает фактическую архитектуру по текущему коду,
а не первоначальный план разработки.

## 1. Что это за приложение

Fitness Mini App — русскоязычный дневник тренировок, питания, восстановления и
замеров. Один React-интерфейс работает:

- внутри Telegram Mini App с авторизацией по `initData`;
- в обычном браузере/PWA с входом по email OTP;
- частично офлайн: каталог и активная тренировка сохраняются в IndexedDB,
  изменения синхронизируются после восстановления сети.

Основные возможности: готовые программы и свои тренировки, подсказка прошлого
рабочего веса, таймер и опциональный автопереход, питание со сценарием
«штрихкод → фото этикетки → ручной ввод», ручной дневной чек-ин сна/шагов/
активности/воды/веса, обхваты, графики, добавки, уведомления, Groq ИИ-тренер,
пользовательская обратная связь и админ-раздел.

HealthKit и Health Connect не интегрированы. Эти показатели вводятся вручную.
Не добавляйте нативную health-интеграцию без отдельного решения владельца.

## 2. Источники истины

При противоречии используйте такой порядок:

1. исполняемый код, тесты и последовательно применённые SQL-миграции;
2. этот `AGENTS.md`;
3. `docs/USER_GUIDE.md` — фактическое пользовательское поведение;
4. `docs/LOCAL_ADMIN_GUIDE.md` и `RUN.md` — текущая локальная эксплуатация;
5. специализированные активные документы из раздела 10.

`_archive_candidates/` — только история и кандидаты на удаление. Не используйте
её файлы как требования, команды или образцы реализации.

## 3. Технологический стек

### Backend

- Python 3.11+ (CI: 3.12), FastAPI, Pydantic 2.
- SQLAlchemy 2 async + asyncpg, PostgreSQL.
- Redis + ARQ worker для фоновых уведомлений.
- HTTPX для внешних API; Loguru; Sentry опционально.
- JWT для сессии приложения; Telegram `initData` и email OTP для входа.
- Groq Chat Completions для текста и распознавания этикетки.

В проекте нет платного OpenAI fallback. Значение `llm_base_url` по умолчанию
`https://api.groq.com/openai/v1` — это совместимый протокол Groq, не сервис
OpenAI. Не добавляйте `OPENAI_API_KEY`, OpenAI SDK или автоматический переход к
OpenAI. Допустим локальный rule-based ответ без внешнего провайдера.

### Frontend

- React 18, TypeScript strict, Vite 6.
- React Router, TanStack Query, Zustand.
- Tailwind CSS; Telegram theme CSS variables.
- Dexie/IndexedDB для offline queue и восстановления тренировки.
- Zod на границах API, Axios, ZXing для штрихкодов.
- Vite PWA/Workbox, Vitest, Playwright, axe-core, Lighthouse.

### Инфраструктура

- Локальный публичный режим: FastAPI отдаёт API и `frontend/dist`, HTTPS даёт
  Tailscale Funnel. Ngrok запрещён и отбрасывается кодом.
- Основной production: один контейнер Timeweb App Platform отдаёт React, API и
  запускает ARQ worker; PostgreSQL 18 и Valkey — управляемые Timeweb DBaaS с
  защищёнными публичными подключениями. DNS делегирован Timeweb, внешнего proxy
  или tunnel перед приложением нет. Полный порядок —
  `docs/TIMEWEB_DOMAIN_CUTOVER.md`.
- VPS production: Ubuntu 24.04 + Docker Compose; Caddy публикует отдельные
  frontend/API-домены, PostgreSQL 18 с pgvector, Redis/ARQ, API и Nginx остаются
  во внутренней Docker-сети. Полный порядок — `docs/VPS_DEPLOYMENT_GUIDE.md`.
- Production-манифесты: корневой `Dockerfile` для Timeweb, `render.yaml`,
  `docker-compose.yml` и Dockerfile каждого приложения.
- PostgreSQL не хранится файлом в репозитории. Данные лежат в кластере по
  `DATABASE_URL`; SQL-схема версионируется в `supabase/migrations/`.
  `tools/redis/dump.rdb` — локальный runtime-снимок Redis, не PostgreSQL;
  он меняется при работе Redis и поэтому игнорируется Git.

## 4. Поток выполнения

```text
Telegram / Browser / PWA
        ↓
React routes (frontend/src/App.tsx)
        ↓ Axios + JWT / offline queue
FastAPI routers (backend/app/routers)
        ↓
services → SQLAlchemy models → PostgreSQL
        ├→ Redis / ARQ → Telegram + Web Push notifications
        ├→ Groq text/vision
        ├→ SMTP email OTP / browser feedback
        └→ Open Food Facts barcode lookup
```

В локальном публичном режиме SPA fallback регистрируется в
`backend/app/frontend.py` после всех API-роутов. Не ставьте catch-all раньше API.

## 5. Карта каталогов

### Backend

- `backend/app/main.py` — приложение, middleware, exception handlers, routers,
  `/health`, SPA serving.
- `backend/app/core/` — settings, DB session, auth dependencies, logging, Sentry.
- `backend/app/models/` — SQLAlchemy-модели. Экспорт новой модели добавить в
  `models/__init__.py`, если этого требует импорт metadata.
- `backend/app/schemas/` — Pydantic request/response contracts.
- `backend/app/routers/` — HTTP-слой: валидация контекста, статус, вызов service.
- `backend/app/services/` — бизнес-логика и внешние интеграции.
- `backend/app/services/scheduler.py` — постоянные тренировочные дни, разовые
  переносы и окно до следующей тренировки; `workout_notifications.py` — расчёт
  workout-reminder; `workout_shift.py` — изолированный legacy API массового
  сдвига уже созданных тренировок; `planned_workout.py` — подготовленные до
  старта замены упражнений, применяемые к конкретной дате программы.
- `backend/app/tasks/notifications.py` — ARQ cron/catch-up уведомлений.
- `backend/app/ai/prompts.py` и `services/ai_engine.py` — системные инструкции,
  контекст, Groq и очистка вывода модели.
- `backend/tests/` — pytest; тесты не должны требовать реальных внешних сервисов.
- `backend/scripts/` — эксплуатация, seed, безопасный smoke и media audit.
- `backend/scripts/seed_content/` — версионированный каталог упражнений,
  программ и продуктов.

### Frontend

- `frontend/src/App.tsx` — lazy routes и публичные `/help`, `/knowledge`.
- `frontend/src/components/layout/Shell.tsx` — авторизация, reconnect, offline
  sync, общий layout и навигация.
- `frontend/src/api/` — единственное место HTTP-контрактов клиента.
- `frontend/src/features/` — feature pages/components/hooks.
- `frontend/src/pages/` — общие страницы: Главная, Ещё, справка, админ.
- `frontend/src/db/syncQueue.ts` — IndexedDB, очередь и снимок активной сессии.
- `frontend/src/features/workout/components/PlannedWorkoutEditor.tsx` — замены
  упражнений на будущую дату без запуска таймера тренировки.
- `frontend/src/store/` — Zustand runtime state.
- `frontend/src/utils/` — чистые правила; рядом размещать `*.test.ts`.
- `frontend/src/lib/telegram.ts` — Telegram SDK, BackButton, deep links.
- `frontend/src/sw.ts` — service worker и offline navigation.
- `frontend/e2e/` — browser, reconnect, nutrition label, a11y и visual tests.
- `frontend/scripts/` — E2E runner, UX audit, Lighthouse, bundle budget.
- `frontend/scripts/publish-build.mjs` — staging-публикация: новые файлы копируются до `index.html`, immutable-ассеты сохраняются для восьми последних релизов.
- `frontend/public/exercise-gifs/` — локальные анимации и manifest;
  `frontend/public/exercise-thumbnails/` — производные PNG первых кадров для списков.

### Данные и операции

- `supabase/migrations/` — append-only миграции PostgreSQL.
- `deploy/timeweb/` и корневой `Dockerfile` — запуск общего контейнера App Platform.
- `scripts/` — Windows/local/server/supervisor/Tailscale/Redis команды.
- `.github/workflows/ci.yml` — обязательные автоматические проверки.
- `artifacts/` и `frontend/artifacts/` — результаты проверок, не runtime source.
- `backups/` — резервные копии; не редактировать и не считать исходниками.

## 6. Куда идти за изменением

| Область | Frontend | Backend / данные | Обязательные тесты |
|---|---|---|---|
| Авторизация Telegram/browser | `Shell.tsx`, `EmailLoginForm.tsx`, `api/auth.ts` | `routers/auth.py`, `auth_service.py`, `email_auth_service.py`, `email_service.py`, users/email migrations | auth, frontend serving, Telegram bot, browser E2E |
| Главная и дневной чек-ин | `HomePage.tsx`, `HabitsCheckin.tsx`, `api/dailyMetrics.ts`, `utils/habits.ts` | `daily_metrics` router/schema/service/model, migration 17 | daily metrics + habits tests |
| Тренировки, автопереход и подготовка замен | `ActiveWorkout.tsx`, `PlannedWorkoutEditor.tsx`, `utils/workoutSession.ts`, `workoutCompletion.ts` | `workouts.py`, `workout_service.py`, `planned_workout.py`, workout models, migration 22 | load progression, planned replacement, session, completion, recovery E2E |
| Программы | `ProgramsPage.tsx`, profile program block, `programRecommend.ts` | `programs.py`, `program_service.py`, `seed_content/programs.json` | program tests + catalog/browser path |
| Каталог упражнений и медиа | `WorkoutCatalogPage.tsx`, `ExerciseCard.tsx`, `ExerciseThumbnail.tsx`, `ExerciseMediaPlayer.tsx`, `ExerciseProgressSection.tsx` | `exercises.py`, `exercise_service.py`, seed, rebuild/audit/thumbnail scripts | media audit, catalog quality, progression unit + recovery E2E |
| Питание/штрихкод/этикетка | `DailyLog.tsx`, scanner/camera modals, `api/nutrition.ts` | `nutrition.py`, `nutrition_service.py`, `nutrition_label_vision.py`, nutrition models/schemas | barcode, label vision, nutrition unit + E2E |
| Прогресс/графики | `ProgressPage.tsx`, `WeeklyOverview.tsx`, progress utils | workout/nutrition/daily metric range endpoints | weekly/progress tests + visual/mobile checks |
| Замеры тела | `features/measurements`, `api/bodyMeasurements.ts` | body measurement router/service/model/schema, migration 18 | body measurement tests |
| Добавки/уведомления | profile/home UI, notification API | supplements/notifications routers, prefs/services, ARQ task, Telegram bot | concurrency, prefs, Telegram tests |
| ИИ | `features/ai-chat`, `api/ai.ts` | `routers/ai.py`, `ai_engine.py`, prompts | AI engine/route tests; assert no `<think>` |
| Обратная связь | `FeedbackModal.tsx`, `api/feedback.ts` | `feedback.py`, Telegram/SMTP delivery | feedback tests + browser scenario |
| Справка | `HelpPage.tsx`, `KnowledgeBasePage.tsx` | нет runtime backend | axe, visual snapshot, USER_GUIDE |
| PWA/offline/reconnect/release update | `main.tsx`, `sw.ts`, `syncQueue.ts`, `Shell.tsx`, `publish-build.mjs` | idempotent workout APIs | reconnect/recovery, stale-release и WebKit/iPhone E2E, production publish |
| Админка | `AdminPage.tsx`, admin API | `admin.py`, `admin_users.py` | permissions and affected CRUD tests |

Перед редактированием большого файла сначала найдите уже существующий component,
hook, service или pure utility. Не создавайте вторую реализацию того же состояния.

## 7. Правила реализации

### Общие

- Сохраняйте существующие пользовательские данные и публичные API.
- Все пользовательские тексты — на русском, короткие и без технических деталей.
- Не скрывайте исключения пустым `except`; преобразуйте их в безопасное сообщение,
  логируя диагностический контекст без секретов.
- Время пользователя трактуйте в его локальной дате; серверные timestamps — UTC.
- Любой внешний ответ недоверенный: timeout, схема, диапазоны, размер и MIME должны
  быть проверены.
- Не логируйте JWT, OTP, Telegram `initData`, пароли, API keys или полные headers.

### Backend

- Router остаётся тонким; расчёты и DB-операции помещайте в service.
- Используйте async SQLAlchemy и dependency session; никаких sync DB-вызовов в
  request path.
- Для пользовательских данных всегда фильтруйте по `user_id` и `is_deleted`.
- Повторяемые клиентские операции должны быть идемпотентны, особенно offline sync.
- HTTP ошибки должны иметь ожидаемый статус и безопасный `detail`.
- Миграции append-only: существующий применённый SQL не переписывать. Новое имя:
  `YYYYMMDDHHMMSS_short_description.sql`, затем обновить model/schema/service/tests.
- Seed не заменяет миграцию. Rebuild каталога сначала запускать с `--dry-run`.

### Frontend

- TypeScript strict; не использовать `any`, если контракт можно выразить типом.
- API payload/response меняется синхронно в backend schema, frontend API/types и
  тестах.
- Server state — TanStack Query/API; session UI state — Zustand/local state;
  offline durable state — Dexie. Не смешивать эти уровни.
- Учитывайте Telegram и обычный browser. Telegram MainButton/BackButton не должны
  ломать browser navigation или жест «назад».
- Модалки: `role=dialog`, `aria-modal`, имя, focus trap/restore, Escape/BackButton.
- Минимальная область нажатия 44×44 px. На мобильном input/select/textarea — не
  меньше 16 px, иначе iOS увеличивает страницу.
- Проверяйте 320, 375/393 и 1440 px, светлую/тёмную тему, safe-area и экран низкой
  высоты. Мобильная bottom nav становится верхней desktop nav на `lg`.
- Не вставляйте ответы ИИ через `dangerouslySetInnerHTML`. Длинный ответ сначала
  показывается свёрнутым.

### Размер файлов

Цель для нового кода, не автоматический повод дробить связную логику:

- React page/component: до 300–350 строк;
- hook/utility/API module: до 200–250 строк;
- Python router/service: до 350–400 строк;
- одна функция обычно до 60–80 строк.

Исторически крупные `ActiveWorkout.tsx`, `ProfilePage.tsx`, `DailyLog.tsx`,
`HomePage.tsx`, `ProgramsPage.tsx`, `telegram_bot.py`, `workout_service.py` уже
превышают цель. Не добавляйте в них новый самостоятельный блок: извлеките
component/hook/utility/service, особенно если изменение добавляет около 80 строк.
Не делайте механический массовый рефакторинг без тестового покрытия.

## 8. Конфигурация и секреты

Полный перечень backend settings находится в `backend/app/core/config.py`, образцы
— в `backend/.env.example` и `.env.production.example`; frontend — в
`frontend/.env.example` и `.env.production.example`.

Критические группы:

- DB/auth: `DATABASE_URL`, `JWT_SECRET`, `BOT_TOKEN`, webhook secret, CORS.
- Public URL: `MINI_APP_URL`, `BOT_USERNAME`; только постоянный HTTPS, не ngrok.
- AI: `LLM_API_KEY`, Groq URL/model/fallback-models, nutrition vision model.
- Email: SMTP host/port/user/password/from, admin feedback email, OTP policy.
- Queue/push: `REDIS_URL`, VAPID public/private/subject.
- Ops: admin Telegram IDs/usernames, Sentry, log directory/retention.

Реальные `.env` не читать в отчёт, не копировать, не коммитить. При добавлении
переменной одновременно обновить Settings, оба релевантных `.env.example`,
deployment manifest и admin docs. Безопасный default не должен включать платный
или внешний сервис неожиданно.

## 9. Команды разработки и проверки

### Быстрый запуск Windows

```powershell
.\start-all.cmd
.\status.cmd
.\stop-all.cmd
```

Подробности установки и supervisor: `RUN.md`, `docs/LOCAL_ADMIN_GUIDE.md`.

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe scripts\smoke_api.py --help
.\.venv\Scripts\python.exe scripts\smoke_api.py
```

Smoke по умолчанию только читает DB и `/health`. `--write` явно создаёт
синтетические записи; `--external` дополнительно вызывает Telegram/Groq и
разрешён только вместе с `--write`.

### Frontend

```powershell
cd frontend
npm test
npm run lint
npm run build
npm run build:publish
npm run check:bundle
npm run test:e2e
npm run audit:lighthouse
```

`npm run build` пишет только в `frontend/.dist-check` и не должен менять
обслуживаемый backend каталог `frontend/dist`. Рабочий `dist` обновляет только
атомарный `build:publish`; иначе теряется граф сохранённых ассетов старых версий.

`audit:lighthouse` требует свежий `dist` и Chrome/Chromium. Visual snapshots
обновлять только после осмысленной визуальной проверки:
`npm run test:e2e -- --update-snapshots`.
Полноэкранные pixel-snapshots эталонно проверяются на Windows: обычный Linux CI
запускает функциональные browser-тесты без `visual-regression.spec.ts`, а job
`Frontend (visual QA)` включает их через `PLAYWRIGHT_VISUAL_QA=1`. Не обновляйте
Windows-эталоны из Linux/macOS; при падении сначала изучите загруженный artifact
`visual-qa-failure` с actual/diff изображениями.

`build:publish` используется эксплуатационными скриптами вместо прямой сборки в
работающий `dist`. Не заменяйте его на `vite build` в `start-all`/installer:
иначе старые Telegram WebView и iPhone PWA снова начнут получать `404` на chunks.

Глубокий авторизованный UX-аудит запускается отдельно по инструкции в
`docs/QA_AUDIT_2026-08-20_DEEP.md`; токен не сохранять в репозитории.

### Миграции и контент

```powershell
.\scripts\apply_migrations_local.ps1
python .\scripts\check_migrations.py
.\scripts\rebuild-content.cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-exercise-thumbnails.ps1
cd backend
.\.venv\Scripts\python.exe scripts\audit_exercise_media.py
```

Не запускать mutating seed/reset/rebuild против production без явного поручения,
backup и dry-run, если он предусмотрен.

## 10. Активная документация

- `README.md` — обзор и быстрые ссылки.
- `RUN.md` — короткий локальный запуск.
- `docs/USER_GUIDE.md` — инструкция пользователя.
- `docs/LOCAL_ADMIN_GUIDE.md` — Windows/Tailscale/supervisor/диагностика.
- `docs/TIMEWEB_DOMAIN_CUTOVER.md` — основной production в Timeweb App Platform,
  DBaaS, DNS и безопасное переключение с локального контура.
- `docs/VPS_DEPLOYMENT_GUIDE.md` — выбор VPS, Ubuntu/Docker, GitHub deploy key,
  перенос PostgreSQL, HTTPS, backup, обновление и диагностика production.
- `docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md` — уведомления и добавки.
- `docs/ADMIN_AI_MODEL_RUNBOOK.md` — Groq-модели и диагностика ИИ.
- `docs/PROD_CHECKLIST.md` — выпуск.
- `docs/DESIGN_SYSTEM.md` — UI-токены и паттерны.
- `docs/exercise-gifs.md`, `docs/EXERCISE_MEDIA_AUDIT_2026-08-20.md` — media pipeline/status.
- `docs/programs-matrix.md` — программы и совместимость.
- `docs/PERFORMANCE_REPORT_2026-08-20.md` — performance baseline.
- `docs/QA_AUDIT_2026-08-20_DEEP.md` — последний полный QA-срез.
- `docs/CHANGELOG.md` — хронология пользовательских и технических изменений.

## 11. Что обновлять после каждой правки

### Всегда

1. Добавить или изменить минимальный тест, который падает без исправления.
2. Запустить проверки пропорционально риску и записать фактический результат.
3. Добавить запись в начало `docs/CHANGELOG.md`: что изменилось, зачем и как
   проверено. Не заявлять о тесте, который не запускался.
4. Проверить отсутствие случайных секретов, runtime-артефактов и unrelated edits.

### По типу изменения

| Изменение | Обязательное обновление |
|---|---|
| Пользовательский экран, сценарий, текст, настройка | соответствующий раздел `docs/USER_GUIDE.md`; при изменении визуального контракта — E2E/snapshot |
| Запуск, URL, supervisor, Redis, SMTP, deployment | `RUN.md` и/или `docs/LOCAL_ADMIN_GUIDE.md`, env examples, deployment manifest |
| Переменная окружения | Settings/type validation + все релевантные `.env.example` + admin/deploy docs |
| API request/response | backend schema/router/service test + frontend API/type/test; описать совместимость |
| Таблица/поле/enum/index | новая SQL migration + model/schema/service + migration check + тест сохранения/чтения |
| Offline/session/reconnect | Dexie schema/queue при необходимости + recovery/reconnect E2E + PWA build |
| Уведомления/добавки | `ADMIN_SUPPLEMENT_NOTIFICATIONS.md`, prefs/task/Telegram tests |
| Groq/ИИ/prompt | `ADMIN_AI_MODEL_RUNBOOK.md`, tests русского ответа, sanitization и no-`<think>` |
| Упражнения/программы/GIF | seed + manifest/checklist + media audit/program matrix + content docs |
| Новая зависимость | lockfile, audit, bundle/license/security оценка; пояснить необходимость |
| Архитектура, путь файла, команда или правило | этот `AGENTS.md` и при необходимости `README.md` |
| Завершённый большой аудит | новый датированный QA/performance report; старый не переписывать как будто он новый |

Не обновляйте все документы механически. Меняйте только те, чьи утверждения
стали неверными. Если код и руководство расходятся, задача не завершена.

## 12. Definition of Done

Работа закончена, когда:

- сценарий реализован во всех затронутых средах (Telegram/browser/offline — где
  применимо), состояния loading/empty/error/retry понятны;
- миграция обратимо и повторяемо применяется, если менялись данные;
- unit/integration/browser tests покрывают регрессию;
- Ruff, ESLint, TypeScript build и релевантные QA-пороги зелёные;
- нет утечки reasoning (`<think>`), токенов, OTP и персональных данных;
- `CHANGELOG` и нужное руководство синхронизированы;
- новые самостоятельные блоки не раздули legacy-монолиты;
- указаны проверки, которые физически требуют реального устройства.

Ручной device QA обязателен перед релизом для Telegram-свайпа назад, системной
камеры, PWA install/update, push-уведомлений и поведения при реальном обрыве
Tailscale/сети. Автотест не заменяет эти проверки; он лишь сокращает их объём.
