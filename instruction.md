# Финальная инструкция для ИИ-агента (Production-Ready)

## Критические правила (не нарушать)

### Никаких галлюцинаций

Твой единственный источник истины — файл `fitness-tz.md`. Перед написанием кода каждого шага ты обязан:

- Процитировать разделы ТЗ, которые реализуешь
- Если в ТЗ нет конкретики — **остановиться и задать вопрос**
- Не придумывать фичи, библиотеки или бизнес-логику, которых нет в ТЗ

### Модульная архитектура

Код строго распределён по смысловым файлам. Запрещено:

- Файлы > 400 строк
- Смешивание UI и бизнес-логики в одном компоненте
- Отсутствие разделения на `components/`, `features/`, `services/`, `utils/`

### Итеративность без финализации

Работа идёт строго по спринтам. После каждого логического блока (файла или группы файлов) ты останавливаешься и пишешь:

> Шаг выполнен. Жду правок или команды двигаться дальше.

### Приоритеты при конфликтах

Если возникает техническое противоречие:

1. **Приоритет 1:** Offline-First функциональность
2. **Приоритет 2:** Безопасность валидации `initData`
3. **Приоритет 3:** Всё остальное

---

## Структура проекта

### Frontend (React + Vite + TS)

```
src/
├── api/                    # TanStack Query hooks, axios instances
├── components/
│   ├── ui/                 # Атомарные компоненты (Button, Card, Modal)
│   └── layout/             # Shell, Header, BottomNavigation
├── features/
│   ├── onboarding/         # Онбординг (анкета → генерация программы)
│   ├── dashboard/          # Главный экран
│   ├── workout/            # Каталог, активная тренировка, завершение
│   ├── nutrition/          # Трекер питания
│   ├── ai-chat/            # AI-тренер чат
│   └── progress/           # Графики, календарь, streak
├── pages/                  # Роутинг (React Router)
├── store/                  # Zustand stores (user, workout, ui)
├── db/                     # Dexie.js схемы, sync queue для оффлайна
├── utils/                  # Чистые функции (расчёт КБЖУ, форматирование)
├── types/                  # Глобальные TypeScript интерфейсы
└── lib/                    # Telegram SDK wrappers, Haptics
```

### Backend (Python + FastAPI)

```
app/
├── core/
│   ├── config.py           # Pydantic Settings (env vars)
│   ├── security.py         # initData валидация (HMAC-SHA256), JWT
│   └── database.py         # SQLAlchemy async session
├── models/                 # SQLAlchemy модели (users, exercises, workouts...)
├── schemas/                # Pydantic схемы (Request/Response)
├── routers/
│   ├── auth.py             # POST /auth/telegram
│   ├── users.py            # GET/PUT /users/me
│   ├── exercises.py        # CRUD /exercises
│   ├── programs.py         # CRUD /programs
│   ├── workouts.py         # POST /workouts, GET /workouts/history
│   ├── nutrition.py        # POST /nutrition/log, GET /nutrition/daily
│   └── ai.py               # POST /ai/chat, POST /ai/analyze
├── services/               # Бизнес-логика (отделена от роутеров!)
│   ├── ai_engine.py        # Гибридный AI (Rule-based + LLM + RAG)
│   ├── nutrition_service.py # Расчёт КБЖУ
│   └── scheduler.py        # Сдвиг расписания при пропуске
├── tasks/                  # Arq фоновые задачи (напоминания, синхронизация)
├── ai/
│   ├── prompts.py          # Системные промпты для LLM
│   ├── rag.py              # Векторизация + pgvector поиск
│   └── rate_limiter.py     # Redis Token Bucket (15 запросов/сутки)
└── utils/                  # Вспомогательные функции
```

---

## Базовый контракт API (для предотвращения галлюцинаций)

### Аутентификация

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/auth/telegram` | Валидация `initData`, возврат JWT (30 дней) |

### Пользователи

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/users/me` | Профиль |
| PUT | `/users/me` | Обновление анкеты (цели, антропометрия) |

### Упражнения и программы

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/exercises` | Каталог (пагинация, фильтры по `muscle_group`) |
| GET | `/exercises/{id}` | Детали + `video_url`, `animation_url` |
| GET | `/programs` | Список программ |
| GET | `/programs/{id}` | Структура программы (JSONB) |

### Тренировки

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/workouts` | Создать экземпляр тренировки (`scheduled_date`) |
| PUT | `/workouts/{id}/complete` | Завершить (RPE, `ai_notes`) |
| GET | `/workouts/history` | История с фильтрами по датам |
| POST | `/workouts/{id}/sets` | Добавить подход (`weight`, `reps`, `rest_time_sec`) |

### Питание

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/nutrition/products?q=яблоко` | Поиск (`pg_trgm` индекс) |
| POST | `/nutrition/log` | Добавить приём пищи (`product_id`, `quantity_grams`, `meal_type`) |
| GET | `/nutrition/daily?date=2026-07-17` | Сводка КБЖУ за день |

### AI-тренер

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/ai/chat` | Сообщение в чат (возвращает ответ LLM + RAG контекст) |
| POST | `/ai/analyze` | Анализ прогресса за 14 дней (текстовый отчёт) |

**Rate Limiting:** `/ai/*` — 15 запросов/сутки на `user_id` (Redis Token Bucket)

---

## Последовательность выполнения (5 спринтов)

### Этап 0: Подготовка (до начала Спринта 1)

**Что делаешь:**

- Инициализа��ия репозиториев (`frontend/`, `backend/`)
- Настройка `tsconfig.json`, `vite.config.ts`, `pyproject.toml`
- Создание структуры папок (как указано выше)
- SQL-миграции для Supabase:
  - Все таблицы из п.4 ТЗ (`users`, `exercises`, `programs`, `workouts`, `workout_sets`, `nutrition_products`, `nutrition_logs`, `ai_conversations`)
  - Обязательные поля: `created_at`, `updated_at`, `is_deleted` (soft delete)
  - `embedding vector(1536)` в `exercises`
  - Индекс `pg_trgm` для `nutrition_products.name_ru`
  - Включение расширения `pgvector`

**Формат ответа:** Список файлов с кодом миграций. Спрашиваешь: «Миграции готовы. Продолжаем Спринт 1?»

---

### Этап 1: Спринт 1 — Фундамент (Неделя 1)

**Цитируешь из ТЗ:** Разделы 7, 8, 9, 10 (Спринт 1)

**Что делаешь:**

**Backend:**

- `app/core/security.py` — валидация `initData` (HMAC-SHA256), генерация JWT
- `app/routers/auth.py` — `POST /auth/telegram`
- `app/core/config.py` — переменные окружения (`DATABASE_URL`, `BOT_TOKEN`, `JWT_SECRET`...)
- Настройка CORS (только `https://web.telegram.org` + кастомный домен)

**Frontend:**

- `src/lib/telegram.ts` — обёртка для `@telegram-apps/sdk` (получение `initData`)
- `src/api/auth.ts` — отправка `initData` на бэкенд, сохранение JWT в `localStorage`
- `src/components/layout/Shell.tsx` — базовый роутинг, применение системных тем Telegram
- Настройка Tailwind (цвета Telegram)

**CI/CD:**

- `.github/workflows/ci.yml` — `pytest` + `npm run build` → автодеплой

**Формат ответа:** Файл за файлом с путями. После завершения спрашиваешь: «Спринт 1 завершён. Жду правок или команды двигаться к Спринту 2?»

---

### Этап 2: Спринт 2 — Ядро тренировок (Неделя 2)

**Цитируешь из ТЗ:** Разделы 4 (`exercises`, `programs`, `workouts`, `workout_sets`), 5 (Экраны), 7 (Telegram Web App API), 10 (Спринт 2)

**Что делаешь:**

**Backend:**

- `app/models/` — SQLAlchemy модели для `exercises`, `programs`, `workouts`, `workout_sets`
- `app/schemas/` — Pydantic схемы
- `app/routers/exercises.py`, `programs.py`, `workouts.py` — CRUD эндпоинты
- Swagger документация (автоматически через FastAPI)

**Frontend:**

- `src/features/workout/components/ExerciseCard.tsx` — карточка упражнения
- `src/features/workout/pages/ActiveWorkout.tsx` — экран активной тренировки
- Интеграция HapticFeedback (вибрация при завершении подхода/таймера)
- Встроенный таймер отдыха
- MainButton для ключевых действий

**Админка (Refine.dev):**

- Базовый CRUD для `exercises` и `programs`

**Формат ответа:** Файл за файлом. Спрашиваешь: «Спринт 2 завершён. Продолжаем?»

---

### Этап 3: Спринт 3 — Оффлайн и прогресс (Неделя 3)

**Цитируешь из ТЗ:** Разделы 2 (Оффлайн), 3 (Dexie.js, Workbox), 5 (Экраны прогресса), 10 (Спринт 3)

**Что делаешь:**

**Frontend:**

- `src/db/schema.ts` — Dexie.js схема (IndexedDB)
- `src/db/syncQueue.ts` — логика фоновой синхронизации
- Кэширование каталога упражнений в IndexedDB
- Локальное сохранение подходов во время тренировки (если нет сети)
- `src/features/progress/pages/Charts.tsx` — графики прогресса
- `src/features/progress/pages/Calendar.tsx` — календарь тренировок
- Streak логика (дни подряд)

**Service Worker:**

- Настройка Workbox для оффлайн-режима

**Формат ответа:** Файл за файлом. Спрашиваешь: «Спринт 3 завершён. Продолжаем?»

---

### Этап 4: Спринт 4 — Питание и AI (Неделя 4)

**Цитируешь из ТЗ:** Разделы 4 (`nutrition_products`, `nutrition_logs`, `ai_conversations`), 5 (Трекер питания, AI-Чат), 6 (Спецификация AI-агента), 13 (Rate limiting), 15 (Импорт продуктов), 10 (Спринт 4)

**Что делаешь:**

**Backend:**

- `app/models/nutrition.py` — модели `nutrition_products`, `nutrition_logs`
- `app/routers/nutrition.py` — эндпоинты (поиск с `pg_trgm`, добавление лога)
- `app/services/nutrition_service.py` — расчёт КБЖУ (Rule-based, без LLM)
- Скрипт импорта продуктов (нормализация, заполнение пропусков нулями)
- `app/ai/rag.py` — векторизация запроса, поиск в pgvector (топ-3)
- `app/ai/prompts.py` — системный промпт AI-тренера (из ТЗ)
- `app/routers/ai.py` — `POST /ai/chat`, `POST /ai/analyze`
- `app/ai/rate_limiter.py` — Redis Token Bucket (15 запросов/сутки)
- Кэширование ответов LLM по хэшу запроса (24 часа)

**Frontend:**

- `src/features/nutrition/pages/DailyLog.tsx` — дневник питания
- Автокомплит поиска продуктов
- Автоматический пересчёт КБЖУ при вводе граммовки
- `src/features/ai-chat/pages/Chat.tsx` — интерфейс чата
- Быстрые промпты-кнопки

**Формат ответа:** Файл за файлом. Спрашиваешь: «Спринт 4 завершён. Продолжаем?»

---

### Этап 5: Спринт 5 — Полировка и QA (Неделя 5)

**Цитируешь из ТЗ:** Разделы 7 (Telegram Bot API), 11 (Тестирование), 12 (Мониторинг), 10 (Спринт 5)

**Что делаешь:**

**Backend:**

- Интеграция Telegram Bot API (отправка напоминаний с deep links)
- `app/tasks/notifications.py` — Arq задачи для напоминаний
- Настройка loguru / structlog (JSON-логи)

**Frontend:**

- Подключение Sentry
- Telegram Analytics (`sendData` для событий)

**Тестирование:**

- `pytest` — расчёт КБЖУ, валидация `initData`, сдвиг расписания
- Vitest — хуки Zustand, утилиты
- Playwright — E2E критический путь (Онбординг → Тренировка → Завершение)
- 20 фиксированных промптов для LLM (assertion-тесты)

**Финальный аудит:**

- Проверка оффлайн-режима (режим «в самолёте»)
- UI/UX на iOS/Android

**Формат ответа:** Файл за файлом. После завершения пишешь: «Спринт 5 завершён. MVP готов к деплою.»

---

## Формат взаимодействия

1. Я даю команду: «Начинаем Этап [Номер]»
2. Ты анализируешь ТЗ, цитируешь разделы, которые реализуешь
3. Ты пишешь код файл за файлом, указывая путь (например, `// app/core/security.py`)
4. После завершения шага ты пишешь: «Шаг выполнен. Жду твоих правок или ком��нды двигаться дальше»
5. Если в ТЗ есть нестыковка или не хватает данных — ты сразу задаёшь вопрос и не пишешь код, пока я не отвечу
