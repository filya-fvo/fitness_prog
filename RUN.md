# Как запустить fitness_prog

## Самый простой способ (рекомендуется)

В корне проекта лежат 3 файла:

| Файл | Что делает |
|------|------------|
| **[start-all.cmd](start-all.cmd)** | Полный запуск: backend + frontend + ngrok + кнопка Open в Telegram |
| **[status.cmd](status.cmd)** | Показать, что сейчас запущено |
| **[stop-all.cmd](stop-all.cmd)** | Остановить backend и frontend |

### Шаг 1 — один раз проверь окружение

1. PostgreSQL запущен, в `backend/.env` есть `DATABASE_URL=...@127.0.0.1:5432/...`  
   (на Windows именно **127.0.0.1**, не `localhost`)
2. Есть `backend/.venv` (если нет — см. «Первый раз» ниже)
3. В `backend/.env` (или корневом `.env`):
   - `BOT_TOKEN=...`
   - `BOT_USERNAME=fil_fit_bot`
   - `NGROK_AUTHTOKEN=...` (токен с https://dashboard.ngrok.com)
4. `ngrok` установлен и доступен в PATH  
5. В Telegram-боте уже можно открывать Mini App (после `start-all` Menu Button настроится сам)

### Шаг 2 — запуск всего

**Дважды кликни:**

```
C:\fitness_prog\start-all.cmd
```

Или в терминале:

```bat
C:\fitness_prog\start-all.cmd
```

Откроются отдельные окна:

1. **BACKEND** — API на порту 8001  
2. **FRONTEND** — Vite на порту 5173  
3. **NGROK** — публичный HTTPS → frontend  

Скрипт сам:

- дождётся готовности API и UI  
- возьмёт HTTPS URL из ngrok  
- пропишет `MINI_APP_URL`  
- настроит синюю кнопку **Open** и webhook на `/start`  

### Шаг 3 — открыть приложение

| Где | URL |
|-----|-----|
| Браузер (локально) | http://127.0.0.1:5173 |
| API docs | http://127.0.0.1:8001/docs |
| ngrok inspector | http://127.0.0.1:4040 |
| Telegram | бот → `/start` → кнопка **Open** |

Публичный HTTPS URL печатается в конце `start-all` и пишется в  
`scripts/ngrok-urls.local.env`.

### Остановить

```bat
C:\fitness_prog\stop-all.cmd
```

Окно **ngrok** закрой вручную (крестик), если оно ещё открыто.

### Уведомления бота (добавки / тренировки / замеры)

**Полная инструкция (открой на ПК):** [УВЕДОМЛЕНИЯ.md](УВЕДОМЛЕНИЯ.md)  
(дубликат имени: [NOTIFICATIONS.md](NOTIFICATIONS.md))

Коротко:

1. Redis (один раз): `winget install -e --id Memurai.MemuraiDeveloper`
2. Проверка: `C:\fitness_prog\status-notifications.cmd`
3. Worker: **`C:\fitness_prog\start-notifications.cmd`** (отдельное окно, не закрывать)
4. В Mini App: Профиль → Уведомления → сохранить  
5. Пользователь хотя бы раз нажал `/start` у бота

История версий фич: [docs/CHANGELOG.md](docs/CHANGELOG.md)  
GIF упражнений: [docs/exercise-gifs.md](docs/exercise-gifs.md)

### Логи (по дням)

Пишутся в корень проекта:

```
C:\fitness_prog\logs\api-YYYY-MM-DD.log
C:\fitness_prog\logs\worker-YYYY-MM-DD.log
C:\fitness_prog\logs\archive\*.log.zip   ← вчера и старше
```

- Один календарный день = один файл на сервис (`api` / `worker`).
- При старте и в полночь старые `.log` уходят в `logs\archive\` как zip.
- Архивы старше 30 дней удаляются (`LOG_ARCHIVE_DAYS` в `backend\.env`).
- Опционально: `LOG_DIR=...` чтобы сменить каталог.

### Статус

```bat
C:\fitness_prog\status.cmd
```

---

## Варианты start-all

```bat
REM всё (по умолчанию)
C:\fitness_prog\start-all.cmd

REM только локально, без ngrok/Telegram
C:\fitness_prog\start-all.cmd -SkipNgrok

REM с ngrok, но без setup Telegram menu/webhook
C:\fitness_prog\start-all.cmd -SkipTelegram
```

Через PowerShell напрямую:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\start-all.ps1
```

---

## Первый раз (если ещё не ставил зависимости)

### Backend

```bat
cd C:\fitness_prog\backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -e ".[dev]"
```

Скопируй `backend\.env.example` → `backend\.env` и заполни:

- `DATABASE_URL`
- `BOT_TOKEN`
- `BOT_USERNAME`
- `JWT_SECRET`
- `NGROK_AUTHTOKEN`

Примени миграции SQL из `supabase/` (как у тебя уже настроено локально).

Опционально сиды:

```bat
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\seed_prod_content.py
.\.venv\Scripts\python.exe scripts\seed_nutrition.py
.\.venv\Scripts\python.exe scripts\gen_exercise_gif_list.py
.\.venv\Scripts\python.exe scripts\apply_local_exercise_gifs.py
```

### Frontend

```bat
cd C:\fitness_prog\frontend
npm.cmd install
```

После этого снова: **`start-all.cmd`**.

---

## Отдельные команды (если не нужен полный стек)

Обёртка: [scripts/dev.cmd](scripts/dev.cmd)

```bat
C:\fitness_prog\scripts\dev.cmd status
C:\fitness_prog\scripts\dev.cmd start              REM только backend+frontend
C:\fitness_prog\scripts\dev.cmd start-backend
C:\fitness_prog\scripts\dev.cmd start-frontend
C:\fitness_prog\scripts\dev.cmd start-ngrok
C:\fitness_prog\scripts\dev.cmd restart-backend
C:\fitness_prog\scripts\dev.cmd restart-frontend
C:\fitness_prog\scripts\dev.cmd restart
C:\fitness_prog\scripts\dev.cmd stop
C:\fitness_prog\scripts\dev.cmd help
```

### Сырой backend

```bat
cd C:\fitness_prog\backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001
```

### Сырой frontend

```bat
cd C:\fitness_prog\frontend
npm.cmd run dev -- --host 0.0.0.0 --port 5173
```

### Сырой ngrok

Токен только из `.env` (`NGROK_AUTHTOKEN`), не коммить в `ngrok.yml`.

```bat
ngrok start --config C:\fitness_prog\scripts\ngrok.yml frontend
```

### Только Telegram Open + webhook (если стек уже запущен)

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\setup_telegram_bot.ps1
C:\fitness_prog\scripts\dev.cmd restart-backend
```

---

## Порты

| Сервис | Порт | URL |
|--------|------|-----|
| Backend API | 8001 | http://127.0.0.1:8001/docs |
| Frontend Vite | 5173 | http://127.0.0.1:5173 |
| ngrok UI | 4040 | http://127.0.0.1:4040 |

API в Telegram идёт **через Vite proxy** (same origin с ngrok URL).  
Отдельный публичный URL для backend не нужен.

---

## Если что-то не работает

| Симптом | Что сделать |
|---------|-------------|
| `start-all` пишет backend not ready | Проверь окно BACKEND, `DATABASE_URL`, что Postgres жив |
| frontend не открывается | В окне FRONTEND: `npm.cmd install`, потом снова start-all |
| ngrok error / auth | Проверь `NGROK_AUTHTOKEN` в `.env`, что `ngrok` в PATH |
| В Telegram нет кнопки Open | Запусти `start-all` ещё раз или `setup_telegram_bot.ps1` |
| `/start` молчит | Нужны backend + ngrok + webhook; смотри `status.cmd` |
| Сменился ngrok URL | Снова **`start-all.cmd`** (он обновит Menu Button) |
| Порт занят | `stop-all.cmd`, потом `start-all.cmd` |

---

## Файлы запуска (карта)

```
C:\fitness_prog\
  start-all.cmd          ← ЖМИ ЭТО для полного старта
  stop-all.cmd
  status.cmd
  RUN.md                 ← эта шпаргалка
  scripts\
    start-all.ps1        ← логика полного старта
    dev.ps1 / dev.cmd    ← точечный start/restart
    setup_telegram_bot.ps1
    ngrok.yml            ← без токена (gitignore)
    ngrok.yml.example
```
