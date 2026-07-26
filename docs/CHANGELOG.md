# Changelog — Fitness Telegram Mini App

Формат: **версия → дата → что вошло**.  
Агент **обязан** дописывать сюда каждый пользовательский фикс/фичу после реализации.

---

## 0.8.8 — 2026-07-26

### Ops / логи
- Дневные файлы логов: `logs/api-YYYY-MM-DD.log`, `logs/worker-YYYY-MM-DD.log`.
- Вчерашние и старше → `logs/archive/*.log.zip` (хранение 30 дней, `LOG_ARCHIVE_DAYS`).
- Подключено в API (`main`) и ARQ worker.

## 0.8.7 — 2026-07-25

### Ops / уведомления
- Отдельная инструкция в корне: `УВЕДОМЛЕНИЯ.md` / `NOTIFICATIONS.md`.
- Лаунчеры: `start-notifications.cmd`, `status-notifications.cmd`.

## 0.8.6 — 2026-07-25

### Прогресс / питание
- Калории: **3 понятных показателя** — сегодня, текущая неделя (с пн), текущий месяц (с 1-го).
- У каждой карточки: съедено, цель, перебор/недобор и диапазон дат.

## 0.8.5 — 2026-07-25

### UX тренировки
- **Таймер тренировки** с момента старта (live clock), время попадает в summary.
- **Завершение** только на последнем упражнении (форма сложности/заметок + MainButton).
- Кнопка **стоп** (квадрат в круге) у таймера и плавающая снизу справа — всегда на экране.

## 0.8.4 — 2026-07-25

### UX / контент
- Завершение тренировки: вместо «RPE» — понятный русский блок **«Насколько тяжело было? (1–10)»** с пояснением, шкалой и подсказками.
- Названия упражнений на русском: face pull / dead bug / bird dog / hollow hold / mountain climbers / goblet / hip thrust / thrusters / jumping jacks и др. переведены в seed + rename-map для БД.

## 0.8.3 — 2026-07-25

### UX тренировки
- **Отдых между подходами** настраивается в карточке упражнения: ±15/±30 с, пресеты 45с–3м, ручной ввод.
- На активном таймере отдыха: кнопки ±15с / ±30с (не только «Пропустить»).

## 0.8.2 — 2026-07-25

### Прогрессия нагрузки (3 недели)
- Цикл **лёгкая → средняя → тяжёлая**: RIR 3–4 / 1–2 / в отказ; повторы 10–15 / 8–12 / 6–8.
- В активной тренировке: степперы веса (±1 кг, ±100 г) и повторов (±1).
- После первых логов — предложение веса/повторов с учётом фазы недели и истории.
- Дата старта программы: `goals.active_program_started_at` (фронт + backend plan meta).

## 0.8.1 — 2026-07-25

### UX
- **Обратная связь:** кнопка на главной → модалка → открывается личный чат с `@Filatov_Slava` с готовым текстом. Сообщение отправляет **сам пользователь** (не бот).

---

## 0.8.0 — 2026-07-25

### Программы (крупный рефактор)
- Новый каталог шаблонов: **29 программ** вместо 8.
- Метаданные в `structure`: `sex`, `location` (home/gym/outdoor), `equipment`, `limitations` (`no_knee`/`no_spine`), `level`, `days_per_week`.
- Генератор: `backend/scripts/build_programs_v2.py` → `seed_content/programs.json`.
- Сид: `seed_prod_content.py` upsert + soft-delete старых шаблонов не из payload.
- Подбор: `programRecommend.ts` учитывает пол, место, инвентарь, суставы, уровень, дни, цель.
- Онбординг: шаги место тренировки + инвентарь + ограничения суставов (7 шагов).
- В зале/на улице в списках **нет разминочных** упражнений (разминка подразумевается отдельно).
- Бэкап: `backups/20260725_200812_programs_overhaul`.

### Прочее (рядом)
- Каталог упражнений: детали + выбор.
- Прогресс: сводка питания день/неделя.
- Админка только `@Filatov_Slava`.

---

## 0.7.2 — 2026-07-24

### Медиа
- **Убран GIF API** (Giphy/fallback-мемы): роутер /media, gif_resolve, фронт-резолв.
- GIF только локально: frontend/public/exercise-gifs/<name>.gif → animation_url.
- Список имён для 100 упражнений: FILENAMES.txt, EXERCISE_GIFS.txt, docs/exercise-gif-filenames.md.
- Скрипты: gen_exercise_gif_list.py, apply_local_exercise_gifs.py.
- Из БД очищены URL giphy.com.

---

## 0.7.1 — 2026-07-24

### UX
- **Время добавок:** выбор слотов через time picker + пресеты до/во время/после тренировки (TimeSlotsEditor), не строка через запятую.
- **Дневник питания:** каталог продуктов с категориями и поиском; пустой запрос показывает список из БД.

### Контент
- Каталог еды расширен: **272 продукта** в 
utrition_products (seed scripts/seed_content/nutrition_products_v2.json, python scripts/seed_nutrition.py).
- **GIF упражнений через API:** GET /media/exercises/{id}/gif и GET /media/gif?q=... (Giphy + fallback CDN), кэш URL в nimation_url. Фронт резолвит GIF без bulk local storage.

### DX
- Бэкапы перед крупными правками: scripts/backup_files.ps1, папка ackups/ (gitignore).
- Документация GIF: live proxy + GIPHY_API_KEY — [docs/exercise-gifs.md](./exercise-gifs.md).

---

## 0.7.0 — 2026-07-24

### UX / продукт
- **Профиль → смена программы:** выбор активной программы тренировок (`goals.active_program_id`).
- **Добавки:** каталог (креатин, бета-аланин, цитруллин и др.) с описанием, эффектом, дозировкой; рекомендации можно удалить; свои добавки — добавить вручную.
- **Уведомления в Telegram-чат:** настройки в профиле:
  - замеры (интервал + время);
  - дни/время тренировки;
  - приём добавок (по слотам времени).
- Бот шлёт сообщения по расписанию (ARQ cron + Redis).

### Контент / медиа
- Документация: откуда брать GIF и куда класть — [`docs/exercise-gifs.md`](./exercise-gifs.md).
- Локальные GIF: `frontend/public/exercise-gifs/`.
- `animation_url` в упражнениях: относительный путь `/exercise-gifs/<file>.gif` или внешний HTTPS.

### Инфра / DX
- Полный запуск: [`start-all.cmd`](../start-all.cmd), стоп/статус, обновлён [`RUN.md`](../RUN.md).
- NGROK_AUTHTOKEN в `.env`, `scripts/ngrok.yml` в gitignore.
- Changelog версий заведён (этот файл).

### Ранее в сессии (зафиксировано в 0.7.0)
- `/start` welcome + inline Open; Menu Button Open; webhook `/telegram/webhook`.
- Детали программы → список упражнений → карточка упражнения.
- GIF-first + кнопка «Видео инструкция» в `ExerciseMediaPlayer`.
- Цели калорий Mifflin–St Jeor, замеры, % дефицита/профицита.
- Расширение базы продуктов питания + API категорий/offset.

---

## 0.6.0 — 2026-07-22

### Production upgrade P0–P3
- 100 упражнений seed, 8+ программ, multi-exercise plan snapshot.
- `POST /programs/{id}/start`, media fields, admin media.
- Docker/compose, Render blueprint, ops runbook, CI hooks, e2e smoke.
- Vite proxy bypass HTML для SPA на `/programs`, `/workouts`.

---

## 0.5.x — MVP sprints 1–5

- Auth Telegram initData + JWT, offline Dexie, workouts, nutrition diary, AI chat, basic reminders.

---

## Как обновлять этот файл

После каждой порции правок по запросу пользователя:

1. Поднять patch/minor в заголовке (или добавить секцию под текущей версией, если ещё не релиз).
2. 3–10 буллетов: что изменилось для пользователя/агента.
3. Указать пути ключевых файлов при необходимости.
4. Синхронно обновить `version` в `backend/app/main.py` (FastAPI) при minor+.
