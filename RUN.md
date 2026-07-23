# Local run / restart cheat sheet

Один файл под рукой. Скрипт с функциями: [scripts/dev.ps1](scripts/dev.ps1)

## Быстрый старт (рекомендуется)

На Windows часто заблокирован ExecutionPolicy — используй `Bypass` или `dev.cmd`.

```powershell
# подгрузить функции в текущий терминал
powershell -NoProfile -ExecutionPolicy Bypass -Command ". C:\fitness_prog\scripts\dev.ps1; Get-FitnessStatus"

# или в уже открытом PS:
Set-ExecutionPolicy -Scope Process Bypass -Force
. C:\fitness_prog\scripts\dev.ps1

Get-FitnessStatus
Start-FitnessStack              # backend :8001 + frontend :5173
# Start-FitnessStack -WithNgrok # + ngrok
Restart-Backend                 # после правок API
Restart-Frontend
Restart-FitnessStack
Stop-FitnessStack
Show-FitnessHelp
```

Без dot-source (удобнее через cmd-обёртку):

```bat
C:\fitness_prog\scripts\dev.cmd status
C:\fitness_prog\scripts\dev.cmd start
C:\fitness_prog\scripts\dev.cmd restart-backend
C:\fitness_prog\scripts\dev.cmd restart-frontend
C:\fitness_prog\scripts\dev.cmd restart
C:\fitness_prog\scripts\dev.cmd stop
C:\fitness_prog\scripts\dev.cmd help
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\dev.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\dev.ps1 restart-backend
```

## Порты

| Сервис   | URL |
|----------|-----|
| Backend  | http://127.0.0.1:8001/docs |
| Frontend | http://127.0.0.1:5173 |
| ngrok UI | http://127.0.0.1:4040 |

## Сырые команды (copy-paste)

### Backend

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\activate
# DATABASE_URL → 127.0.0.1 (не localhost)
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001
# с авто-перезагрузкой:
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001 --reload
```

Перезапуск вручную:

```powershell
# убить процесс на 8001
Get-NetTCPConnection -LocalPort 8001 -State Listen -EA SilentlyContinue |
  Select-Object -Expand OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
# затем снова uvicorn (см. выше)
```

### Frontend

```powershell
cd C:\fitness_prog\frontend
npm.cmd install
npm.cmd run dev -- --host 0.0.0.0 --port 5173
```

> В PowerShell используй `npm.cmd`, не `npm` (execution policy).

### ngrok (Telegram Mini App)

```powershell
ngrok start --config C:\fitness_prog\scripts\ngrok.yml frontend
# публичный https → BotFather Web App URL
# API идёт через Vite proxy (same origin)
```

### Worker (опционально, Redis)

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\arq.exe app.tasks.notifications.WorkerSettings
```

### Seed / тесты

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\seed_prod_content.py
.\.venv\Scripts\python.exe -m pytest -q

cd C:\fitness_prog\frontend
npm.cmd test -- --run
npm.cmd run build
```

Или через скрипт: `Invoke-FitnessSeed`, `Invoke-FitnessTest`.

## Когда что перезапускать

| Изменение | Действие |
|-----------|----------|
| `backend/app/**` | `Restart-Backend` (или uvicorn `--reload`) |
| `frontend/src/**` | обычно HMR; иначе `Restart-Frontend` |
| `.env` backend | `Restart-Backend` |
| миграции SQL | migrate → `Restart-Backend` |
| новый код energy/targets | `Restart-Backend` |
| Telegram не открывает | проверь ngrok https + BotFather URL |

## Профиль / калории

После заполнения профиля (замеры, возраст, % дефицита):

- дневник: `/nutrition` — цель из API, не 2200
- профиль: `/profile`

## Важно

- `DATABASE_URL` на Windows: `127.0.0.1`, не `localhost`
- не коммить `.env` с секретами
- tunnel URL смотри в ngrok UI или `scripts/ngrok-urls.local.env`
