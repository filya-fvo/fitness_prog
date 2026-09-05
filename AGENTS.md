# AGENTS.md — карта и правила Fitness Mini App

Обновлено: 2026-09-05. Этот файл — первая точка входа для любого агента,
который меняет проект. Он описывает фактическую архитектуру по текущему коду,
а не первоначальный план разработки.

## 1. Что это за приложение

Fitness Mini App — русскоязычный дневник тренировок, питания, восстановления и
замеров. Один React-интерфейс работает:

- внутри Telegram Mini App с авторизацией по `initData`;
- в обычном браузере/PWA с входом через Telegram OIDC или email OTP;
- частично офлайн: каталог и активная тренировка сохраняются в IndexedDB,
  изменения синхронизируются после восстановления сети.

Основные возможности: готовые программы и свои тренировки, подсказка прошлого
рабочего веса, таймер и опциональный автопереход, питание со сценарием
«штрихкод → фото этикетки → ручной ввод», ручной дневной чек-ин сна/шагов/
активности/воды, датированные вес и обхваты, графики, добавки, уведомления,
локальный ИИ-тренер, безопасные приглашения по ссылке/коду, дружба и частные
соревнования на регулярность с другом и в глобальном сезоне, пользовательская
поддержка и админ-раздел.

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
- JWT для сессии приложения; Telegram `initData`, Telegram OIDC и email OTP для входа.
- Локальный `llama.cpp` + Qwen2.5-3B-Instruct Q4_K_M для текста; отдельный
  Tesseract `rus+eng` для фото этикетки.

Production не отправляет данные во внешние AI API и не имеет Groq/OpenAI
fallback. `llm_base_url` указывает только на внутренний Docker-сервис `llm`;
код отклоняет внешний host. Не добавляйте внешнего AI-провайдера без отдельного
решения владельца. При недоступности модели допустим безопасный rule-based ответ.

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
- Основной production: Timeweb VPS на Ubuntu 24.04 + Docker Compose; Caddy публикует отдельные
  frontend/API-домены, PostgreSQL 18 с pgvector, Redis/ARQ, API, Nginx, Qwen и
  Tesseract остаются во внутренних Docker-сетях. DNS делегируется Timeweb,
  Cloudflare не используется.
  Фактический порядок переключения — `docs/TIMEWEB_DOMAIN_CUTOVER.md`, полный
  универсальный runbook — `docs/VPS_DEPLOYMENT_GUIDE.md`.
- Production-манифесты: `docker-compose.yml`, Dockerfile каждого приложения,
  корневой альтернативный `Dockerfile` для App Platform и `render.yaml`.
  Backend-образ собирается из корня репозитория: так канонические
  `docs/USER_GUIDE.md` и `docs/LOCAL_ADMIN_GUIDE.md` попадают в `/docs` для
  Telegram `/help` и административной повторной отправки. Не возвращайте context
  к `backend/` без эквивалентной упаковки этих файлов и обновления теста образа.
- PostgreSQL не хранится файлом в репозитории. Данные лежат в кластере по
  `DATABASE_URL`; SQL-схема версионируется в `supabase/migrations/`.
  `tools/redis/dump.rdb` — локальный runtime-снимок Redis, не PostgreSQL;
  он меняется при работе Redis и поэтому игнорируется Git.

### Куда публиковать production-изменения

- Единственный production-репозиторий: `https://github.com/filya-fvo/fitness_prog.git`.
- Production-ветка: `timeweb-production-20260825`. Копия на VPS находится в
  `/opt/fitness/source` и должна оставаться на той же ветке.
- Локальный commit не является публикацией. После зелёных проверок агент
  должен: (1) закоммитить, (2) выполнить `git push origin timeweb-production-20260825`,
  (3) на VPS сделать backup, `git pull --ff-only`, rebuild/migrations/`docker compose up -d`,
  (4) проверить Compose, `https://api.filfitclub.ru/health` и `https://app.filfitclub.ru`.
  Не завершать production-задачу только с локальным commit.
- Точные команды обновления и rollback — в разделе «Обновление приложения»
  `docs/TIMEWEB_DOMAIN_CUTOVER.md`. Реальные `.env.production`, SSH-ключи и токены в Git не попадают.

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
        ├→ internal llama.cpp/Qwen (text) + Tesseract OCR (label image)
        ├→ SMTP email OTP / consented service email
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
- `backend/app/services/invite_service.py` — HMAC-хэши приглашений, срок/лимиты,
  preview и dual-mode принятие: новый аккаунт получает referral attribution,
  существующий — явное предложение дружбы и частного соревнования.
- `backend/app/services/social_service.py`, `social_queries.py`,
  `competition_scoring.py` и `competition_analytics.py` — жизненный цикл дружбы,
  взаимное согласие, неизменяемые исходные значения и приватная аналитика
  регулярности, веса, талии и относительной силы.
- `backend/app/services/global_competitions.py` — добровольные 28-дневные сезоны
  регулярности, псевдонимы, группы по частоте расписания и privacy threshold.
- `backend/app/services/scheduler.py` — постоянные тренировочные дни, дата старта
  активной программы как нижняя граница календаря, разовые
  переносы и окно до следующей тренировки; `workout_notifications.py` — расчёт
  workout-reminder; `workout_shift.py` — изолированный legacy API массового
  сдвига уже созданных тренировок; `planned_workout.py` — подготовленные до
  старта замены упражнений, применяемые к конкретной дате программы.
- `backend/app/services/admin_system.py` — безопасные read-only проверки
  DB/Redis/worker/очереди и allowlist сведений из host status-файлов.
- `backend/app/services/admin_audit.py` — allowlist снимков и append-only журнал
  административных изменений; таблица защищена PostgreSQL-триггером.
- `backend/app/services/admin_exercises.py` — поиск, фильтры, media preflight и
  безопасный архив каталога; `admin_exercise_import.py` — проверенный по отпечатку
  транзакционный JSON-import до 500 упражнений с итоговым audit.
- `backend/app/services/admin_exercise_media.py` и публичный router
  `exercise_media.py` — контролируемая загрузка изображений/GIF в PostgreSQL,
  проверка формата и неизменяемая раздача по непрогнозируемому UUID.
- `backend/app/services/admin_user_detail.py`, `admin_user_actions.py`, `admin_user_export.py` — подробная
  карточка пользователя, безопасные действия и allowlist выгрузки без OTP/Web Push секретов.
- `backend/app/services/admin_broadcasts.py`, `admin_broadcast_audience.py`,
  `admin_broadcast_delivery.py` — черновики рассылок, allowlist аудиторий и
  пакетная Telegram-доставка с идемпотентностью и ограничением скорости.
- `backend/app/tasks/notifications.py` — ARQ cron/catch-up уведомлений.
- `backend/app/ai/prompts.py`, `backend/app/ai/analytics.py`,
  `services/ai_engine.py`, `services/workout_metrics.py` и `services/local_llm.py` —
  системные инструкции, доменная аналитика, единая математика нагрузки,
  локальный Qwen и очистка вывода модели;
  `app/ocr_main.py` — закрытый Tesseract-сервис.
- `backend/tests/` — pytest; тесты не должны требовать реальных внешних сервисов.
- `backend/scripts/` — эксплуатация, seed, безопасный smoke и media audit.
- `backend/scripts/seed_content/` — версионированный каталог упражнений,
  программ и продуктов.

### Frontend

- `frontend/src/App.tsx` — lazy routes и публичные `/help`, `/knowledge`.
- `frontend/src/components/layout/Shell.tsx` — авторизация, reconnect, offline
  sync, общий layout и навигация; `hooks/useTelegramExitGesture.ts` сохраняет
  системный выход Android и добавляет узкий edge-swipe выхода для Telegram iOS.
- `frontend/src/api/` — единственное место HTTP-контрактов клиента.
- `frontend/src/features/` — feature pages/components/hooks.
- `frontend/src/features/invites/` — создание, отправка, ручной код, preview и
  явное принятие приглашения; незавершённый `startapp` переживает onboarding.
- `frontend/src/features/social/` — друзья, настраиваемые частные соревнования на
  7–365 дней и глобальный сезон регулярности без раскрытия дневника.
- `frontend/src/features/admin-system/` — отдельный экран состояния системы,
  не раздувающий legacy `AdminPage.tsx`.
- `frontend/src/features/admin-audit/` — отдельный журнал действий с фильтрами и
  серверной пагинацией.
- `frontend/src/features/admin-exercises/` — полный редактор каталога с
  серверными фильтрами, preflight медиа/дублей и dry-run импорта.
- `frontend/src/features/admin-programs/` — визуальный редактор программ: дни,
  упражнения из каталога, порядок, копирование, preview, версии, публикация и rollback.
- `frontend/src/features/admin-user/` — отдельная карточка пользователя с ленивыми
  блоками активности/связи и визуально отделёнными опасными действиями.
- `frontend/src/features/admin-broadcasts/` — редактор, Telegram-preview,
  подтверждение запуска, прогресс и серверная история рассылок.
- `frontend/src/pages/` — общие страницы: Главная, Ещё, справка, админ.
- `frontend/src/db/syncQueue.ts` — IndexedDB, общая очередь тренировок, профиля и
  замеров, а также снимок активной сессии; `db/bodyMeasurements.ts` —
  пользовательский кэш и объединение операций замера по дате.
- `frontend/src/features/workout/components/PlannedWorkoutEditor.tsx` — замены
  упражнений на будущую дату без запуска таймера тренировки.
- `frontend/src/store/` — Zustand runtime state.
- `frontend/src/utils/` — чистые правила; рядом размещать `*.test.ts`.
- `frontend/src/lib/telegram.ts` — Telegram Mini App SDK, BackButton, deep links;
  `lib/telegramLogin.ts` — лениво загружаемый официальный browser Login SDK;
  `lib/browserSession.ts` — преобразование профиля и классификация проверки
  сохранённой браузерной сессии.
- `frontend/src/sw.ts` — service worker и offline navigation.
- `frontend/src/lib/appUpdate.ts` и публичный `version.json` — обнаружение новой
  сборки и безопасное автообновление без прерывания тренировки или
  несохранённой формы.
- `frontend/e2e/` — browser, reconnect, nutrition label, a11y и visual tests.
- `frontend/scripts/` — E2E runner, UX audit, Lighthouse, bundle budget.
- `frontend/scripts/publish-build.mjs` — staging-публикация: новые файлы копируются до `index.html`, immutable-ассеты сохраняются для восьми последних релизов.
- `frontend/public/exercise-gifs/` — локальные анимации и manifest;
  `frontend/public/exercise-thumbnails/` — производные PNG первых кадров для списков.

### Данные и операции

- `supabase/migrations/` — append-only миграции PostgreSQL.
- `deploy/timeweb/` и корневой `Dockerfile` — сохранённый альтернативный запуск
  общего контейнера App Platform; текущий Timeweb production использует Compose.
- `scripts/` — Windows/local/server/supervisor/Tailscale/Redis команды.
- `scripts/apply_migrations_vps.sh` — production Compose runner: применяет SQL в
  транзакции и фиксирует имена завершённых файлов в `fitness_schema_migrations`.
- `.github/workflows/ci.yml` — обязательные автоматические проверки.
- `artifacts/` и `frontend/artifacts/` — результаты проверок, не runtime source.
- `backups/` — резервные копии; не редактировать и не считать исходниками.

## 6. Куда идти за изменением

| Область | Frontend | Backend / данные | Обязательные тесты |
|---|---|---|---|
| Авторизация Telegram/browser | `Shell.tsx`, `TelegramBrowserLogin.tsx`, `EmailLoginForm.tsx`, `api/auth.ts`, `lib/telegramLogin.ts` | `routers/auth.py`, `auth_service.py`, `telegram_browser_auth.py`, `email_auth_service.py`, `email_service.py`, users/email migrations | auth/OIDC/JWKS, frontend serving, Telegram bot, browser E2E |
| Главная и дневной чек-ин | `HomePage.tsx`, `HabitsCheckin.tsx`, `api/dailyMetrics.ts`, `utils/habits.ts` | `daily_metrics` router/schema/service/model, migration 17 | daily metrics + habits tests |
| Тренировки, автопереход и подготовка замен | `ActiveWorkout.tsx`, `PlannedWorkoutEditor.tsx`, `utils/workoutSession.ts`, `workoutCompletion.ts` | `workouts.py`, `workout_service.py`, `planned_workout.py`, workout models, migration 22 | load progression, planned replacement, session, completion, recovery E2E |
| Программы | `ProgramsPage.tsx`, profile program block, `programRecommend.ts` | `programs.py`, `program_service.py`, `seed_content/programs.json` | program tests + catalog/browser path |
| Каталог упражнений и медиа | `WorkoutCatalogPage.tsx`, `ExerciseCard.tsx`, `ExerciseThumbnail.tsx`, `ExerciseMediaPlayer.tsx`, `ExerciseProgressSection.tsx`, `features/admin-exercises` | `exercises.py`, `exercise_service.py`, `admin_exercise_media.py`, `exercise_media_assets`, seed, rebuild/audit/thumbnail scripts | media upload/audit, media audit, catalog quality, progression unit + recovery E2E |
| Питание/штрихкод/этикетка | `DailyLog.tsx`, scanner/camera modals, `api/nutrition.ts` | `nutrition.py`, `nutrition_service.py`, `nutrition_label_vision.py`, nutrition models/schemas | barcode, label vision, nutrition unit + E2E |
| Прогресс/графики | `ProgressPage.tsx`, `WeeklyOverview.tsx`, progress utils | workout/nutrition/daily metric range endpoints | weekly/progress tests + visual/mobile checks |
| Замеры тела | `features/measurements`, `api/bodyMeasurements.ts`, `db/bodyMeasurements.ts`, `db/syncQueue.ts` | body measurement router/service/model/schema, migration 18 | body measurement tests + offline reconnect E2E |
| Добавки/уведомления | profile/home UI, notification API | supplements/notifications routers, prefs/services, ARQ task, Telegram bot | concurrency, prefs, Telegram tests |
| ИИ | `features/ai-chat`, `api/ai.ts` | `routers/ai.py`, `ai_engine.py`, prompts | AI engine/route tests; assert no `<think>` |
| Поддержка | `features/support`, `api/support.ts`; админ: `features/admin-support` | `support.py`, `admin_support.py`, `support_service.py`, `support_attachments.py`, ARQ/Telegram notification, migrations 30–31 | support API/task/attachment tests + user/admin browser scenario |
| Приглашения | `features/invites`, `api/invites.ts`, `utils/pendingInvite.ts`, `lib/telegram.ts` | `invites.py`, `invite_service.py`, invite models/schema, migration 33 | hash/rate-limit/idempotency tests, deep-link unit + browser E2E |
| Друзья и соревнования | `features/social`, `api/social.ts` | `social.py`, `social_service.py`, `social_queries.py`, `global_competitions.py`, `competition_scoring.py`, `competition_analytics.py`, migrations 34–37 | consent/privacy, baseline/scoring, cohort threshold, block/idempotency unit + mobile browser E2E |
| Справка | `HelpPage.tsx`, `KnowledgeBasePage.tsx` | нет runtime backend | axe, visual snapshot, USER_GUIDE |
| PWA/offline/reconnect/release update | `main.tsx`, `sw.ts`, `syncQueue.ts`, `Shell.tsx`, `publish-build.mjs` | idempotent workout APIs | reconnect/recovery, stale-release и WebKit/iPhone E2E, production publish |
| Админка | `AdminPage.tsx`, `features/admin-filters`, `features/admin-system`, `features/admin-audit`, `features/admin-user`, `features/admin-broadcasts`, `features/admin-exercises`, admin API | `admin.py`, `admin_users.py`, `admin_system.py`, `admin_audit.py`, `admin_user_*`, `admin_broadcast*`, `admin_exercises.py` | permissions, immutable audit, saved-filter allowlist, bounded group export, system states, export allowlist, broadcast idempotency/rate-limit, exercise media/usage safety and affected CRUD tests |

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

- DB/auth: `DATABASE_URL`, `JWT_SECRET`, `BOT_TOKEN`, optional public
  `TELEGRAM_LOGIN_CLIENT_ID`, webhook secret, CORS.
- Public URL: `MINI_APP_URL`, `BOT_USERNAME`; только постоянный HTTPS, не ngrok.
- AI/OCR: внутренние `LLM_BASE_URL`, `LLM_MODEL`, лимиты timeout/output и
  `OCR_BASE_URL`; модель лежит вне Git в `/opt/fitness/models`.
- Email: SMTP host/port/user/password/from and OTP policy.
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
синтетические записи; `--external` дополнительно вызывает Telegram и локальный ИИ и
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
- `docs/TIMEWEB_DOMAIN_CUTOVER.md` — фактический Timeweb VPS, DNS и безопасное
  переключение с локального Supervisor/Tailscale без потери данных.
- `docs/VPS_ADMIN_GUIDE.md` — повседневная инструкция владельца: SSH, Compose, логи,
  PostgreSQL/таблицы, backup, обновление и первичная диагностика production.
- `docs/ADMIN_PANEL_ROADMAP.md` — последовательный план развития админки: состояние
  системы, аудит, карточка пользователя, рассылки, контент, аналитика и безопасность.
- `docs/QA_PRODUCT_BACKLOG_2026-08-28.md` — предрелизный аудит 18 персон,
  замеров/ИИ/Admin 1–5 и исполнимый backlog соревнований, приглашений и Telegram
  OIDC; содержит обязательный gate перед Admin 6.
- `docs/VPS_DEPLOYMENT_GUIDE.md` — выбор VPS, Ubuntu/Docker, GitHub deploy key,
  перенос PostgreSQL, HTTPS, backup, обновление и диагностика production.
- `docs/ADMIN_SUPPLEMENT_NOTIFICATIONS.md` — уведомления и добавки.
- `docs/ADMIN_AI_MODEL_RUNBOOK.md` — локальные Qwen/Tesseract и диагностика ИИ.
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
| Qwen/ИИ/OCR/prompt | `ADMIN_AI_MODEL_RUNBOOK.md`, tests русского ответа, OCR-парсера, sanitization и no-`<think>` |
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

## 13. Локальная карта Graphify

- Для широких вопросов об архитектуре, зависимостях и влиянии изменений сначала
  используйте `$graphify` или `scripts/graphify.cmd query`, если существует
  `graphify-out/graph.json`. Для точечной правки в уже известном файле граф не обязателен.
- Карта — производный навигационный индекс, а не источник истины. Перед диагнозом
  и изменением подтверждайте найденное по актуальному коду и тестам с обычным
  приоритетом источников из раздела 2.
- Пересборка выполняется локально и детерминированно: только `--code-only`, без
  внешнего LLM, MCP, watch/strict-режима и git hooks. `.gitignore` отключать нельзя.
- После структурных изменений обновляйте карту командами из README. Graphify и его
  runtime не устанавливаются на production VPS.
