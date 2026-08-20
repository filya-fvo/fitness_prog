# Уведомления Fitness Mini App — инструкция для ПК

Отдельный файл **в корне проекта**. Откройте его в проводнике:

```
C:\fitness_prog\УВЕДОМЛЕНИЯ.md
```

Здесь только про **Telegram-уведомления** (тренировки / замеры / добавки): что поставить, как запустить, как проверить.

---

## Что это и как работает

| Часть | Роль |
|--------|------|
| **Telegram-бот** (`BOT_TOKEN`) | Доставляет сообщения в личный чат |
| **Backend API** (порт 8001) | Хранит настройки пользователя, API `/notifications/*` |
| **Redis** | Очередь фоновых задач |
| **ARQ worker** | Каждую минуту смотрит расписание и шлёт due-уведомления |
| **Профиль → Уведомления** (в Mini App) | Пользователь включает дни/время и сохраняет |

Без **Redis + worker** расписание **не тикает**.  
Без **`/start` у бота** Telegram часто не даёт писать пользователю.

Типы напоминаний:
- **Тренировки** — выбранные дни недели + время
- **Замеры** — время + интервал (например раз в 14 дней)
- **Добавки** — по слотам из стека добавок (если включено)
- **Вода** — цель мл/день, интервал (мин), окно «с–до»; бот пишет сколько уже отмечено
- **Калории** — одно или несколько времён; бот пишет съедено / цель / недобор или перебор

**Catch-up (по умолчанию вкл.):** если worker/сервер был выключен в момент слота,  
уведомление уйдёт **после включения** (один раз за слот в тот же день), а не «пропадёт».

Часовой пояс по умолчанию: **Europe/Moscow**.

Вода для бота синхронизируется с сервером (`PUT /notifications/water`) при отметке на Главной.

---

## Быстрый старт (Windows)

### 0. Один раз: зависимости

1. Уже должны работать backend + frontend (см. [RUN.md](RUN.md) / `start-all.cmd`).
2. В `backend\.env` должны быть:

```env
BOT_TOKEN=...токен_от_BotFather...
BOT_USERNAME=fil_fit_bot
REDIS_URL=redis://127.0.0.1:6379/0
```

> На Windows в URL лучше **`127.0.0.1`**, не `localhost`.

3. Пользователь **хотя бы раз** открыл бота и нажал **`/start`**.

### 1. Redis (порт 6379)

Нужен Redis на **6379** (или свой URL в `REDIS_URL`).

#### Рекомендуется: portable Redis в проекте (без MSI / без админа)

Memurai через `winget` у многих падает с **exit code 1603**  
(`SFXCA: Failed to create temp directory. Error code 5` — нет прав на temp/службу).

**Обходной путь проекта:**

```bat
C:\fitness_prog\start-redis.cmd
```

Скрипт:
1. скачает Windows-сборку Redis в `tools\redis\` (если ещё нет);
2. откроет окно **FITNESS REDIS** на `127.0.0.1:6379`.

Окно Redis **не закрывать**, пока нужны уведомления.

Проверка:

```bat
C:\fitness_prog\status-notifications.cmd
```

Должно быть: `Redis TCP 127.0.0.1:6379 = True`.

Ручная докачка (если `start-redis` ругается на сеть):

```bat
cd /d C:\fitness_prog
backend\.venv\Scripts\python.exe scripts\install-redis-portable.py
C:\fitness_prog\start-redis.cmd
```

#### Альтернатива A — Memurai (только от администратора)

1. Правый клик по **PowerShell / Terminal → Запуск от имени администратора**
2. Затем:

```bat
winget install -e --id Memurai.MemuraiDeveloper
```

Если снова **1603** — не мучайтесь, используйте portable `start-redis.cmd`.

#### Альтернатива B — облако Upstash (free)

Создайте Redis → URL в `backend\.env`:

```env
REDIS_URL=rediss://default:PASSWORD@xxxx.upstash.io:6379
```

Тогда локальный Redis не нужен (worker ходит в облако).

### 2. Запустить worker уведомлений

**Двойной клик:**

```
C:\fitness_prog\start-notifications.cmd
```

Или:

```bat
C:\fitness_prog\start-notifications.cmd
```

Откроется отдельное окно **FITNESS NOTIFICATIONS (ARQ)**.  
Его **не закрывать**, пока нужны авто-напоминания.

Остановка: `Ctrl+C` в окне worker или закрыть окно.

### 3. Backend должен быть запущен

Worker ходит в БД через тот же backend-код/`.env`.  
Обычно уже крутится через:

```
C:\fitness_prog\start-all.cmd
```

API: http://127.0.0.1:8001/docs

### 4. Настроить расписание в приложении

1. Открыть Mini App (Telegram → бот → Open).
2. **Профиль → вкладка «Уведомления»**.
3. Включить нужное (тренировки / замеры / добавки), дни, время.
4. **Сохранить**.

Настройки пишутся в `users.goals.notification_settings`.

### 5. Проверить, что всё живо

```bat
C:\fitness_prog\status-notifications.cmd
```

Ожидаемо:
- Redis reachable / PING True  
- BOT_TOKEN set = True  
- arq.exe = True  
- worker process detected (если уже запущен)

Ручная отправка «что due прямо сейчас» (нужен JWT пользователя):

- в UI профиля, если есть кнопка «отправить сейчас» / dispatch  
- или API: `POST /notifications/dispatch-due` (Swagger http://127.0.0.1:8001/docs)

Worker сам раз в минуту делает аналог `dispatch-all`.

---

## Файлы запуска (корень проекта)

| Файл | Назначение |
|------|------------|
| [start-redis.cmd](start-redis.cmd) | Portable Redis `127.0.0.1:6379` (обход Memurai 1603) |
| [start-notifications.cmd](start-notifications.cmd) | Запуск ARQ worker (+ авто-попытка Redis) |
| [status-notifications.cmd](status-notifications.cmd) | Статус Redis / env / worker |
| [scripts/install-redis-portable.py](scripts/install-redis-portable.py) | Скачать Redis в `tools/redis` |
| [scripts/start-redis.ps1](scripts/start-redis.ps1) | Логика Redis |
| [scripts/start-notifications.ps1](scripts/start-notifications.ps1) | Логика worker |
| [scripts/status-notifications.ps1](scripts/status-notifications.ps1) | Логика статуса |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) / [УВЕДОМЛЕНИЯ.md](УВЕДОМЛЕНИЯ.md) | Эта инструкция |

Связанный общий запуск стека: [start-all.cmd](start-all.cmd), [RUN.md](RUN.md).

---

## Пошагово «с нуля» (чеклист)
`start-redis.cmd` → Redis OK (или Upstash URL / Memurai от админа
- [ ] PostgreSQL запущен, backend `.venv` есть  
- [ ] `backend\.env`: `BOT_TOKEN`, `BOT_USERNAME`, `REDIS_URL`  
- [ ] Redis установлен и слушает порт (или Upstash URL)  
- [ ] `status-notifications.cmd` → Redis OK  
- [ ] `start-all.cmd` → API + UI  
- [ ] `start-notifications.cmd` → окно ARQ открыто  
- [ ] В Telegram у бота нажали `/start`  
- [ ] Профиль → Уведомления → сохранили расписание  
- [ ] Для теста поставьте время **на ближайшие 1–2 минуты** и день = сегодня  
- [ ] Дождитесь минуты cron **или** вызовите `POST /notifications/dispatch-due`  
- [ ] Сообщение пришло в чат с ботом  

---

## Ручной запуск worker (без .cmd)

```bat
cd /d C:\fitness_prog\backend
.\.venv\Scripts\arq.exe app.tasks.notifications.WorkerSettings
```

Через dev-скрипт:

```bat
C:\fitness_prog\scripts\dev.cmd worker
```

(если команда `worker` доступна в вашем `dev.ps1`)

---

## Настройки по умолчанию (если пользователь ничего не трогал)

- Часовой пояс: `Europe/Moscow`  
- Замеры: вкл, `10:00`, каждые 14 дней  
- Тренировки: вкл, `18:30`, дни Пн/Ср/Пт (`0,2,4`)  
- Добавки: вкл (слоты из стека добавок)

Окно срабатывания: около **±7 минут** от заданного времени (см. `notification_prefs.py`).

---

## API (для отладки)

База: `http://127.0.0.1:8001` + JWT (`Authorization: Bearer ...`).

| Метод | Путь | Зачем |
|--------|------|--------|
| GET | `/notifications/settings` | Текущие настройки |
| PUT | `/notifications/settings` | Сохранить настройки |
| POST | `/notifications/dispatch-due` | Отправить due **текущему** пользователю |
| POST | `/notifications/dispatch-all` | Пройти пользователей (как cron) |
| POST | `/notifications/reminders` | Разовое напоминание по `workout_id` |

Код:
- [backend/app/tasks/notifications.py](backend/app/tasks/notifications.py) — ARQ cron  
- [backend/app/routers/notifications.py](backend/app/routers/notifications.py) — HTTP  
- [backend/app/services/notification_prefs.py](backend/app/services/notification_prefs.py) — логика due  

---

## Логи (API + worker)

После перезапуска backend / `start-notifications` пишутся **дневные** файлы:

```
C:\fitness_prog\logs\api-YYYY-MM-DD.log
C:\fitness_prog\logs\worker-YYYY-MM-DD.log
C:\fitness_prog\logs\archive\*.log.zip
```

- 1 день = 1 файл на сервис  
- вчера и старше → zip в `archive\`  
- zip старше 30 дней удаляются (`LOG_ARCHIVE_DAYS`)  

См. также [RUN.md](RUN.md) § «Логи».

## Частые проблемы

| Симптом | Что проверить |
|---------|----------------|
| Ничего не приходит | Открыто ли окно `start-notifications`? Redis up? |
| Worker сразу падает | `REDIS_URL`, порт 6379, firewall |
| Memurai winget **1603** | Нет прав на temp/службу → **`start-redis.cmd`** (portable) |
| dry_run / нет send | `BOT_TOKEN` пустой или `replace_with...` |
| Telegram error «bot can't initiate» | Пользователь не жал `/start` боту |
| Не в то время | Часовой пояс в настройках; окно ±7 мин; день недели |
| Добавки молчат | В профиле стек добавок + `times` + supplements enabled |
| Backend другой `.env` | Worker читает `backend\.env` (не путать с корневым) |

Починка Redis без Memurai:

```bat
C:\fitness_prog\start-redis.cmd
C:\fitness_prog\status-notifications.cmd
C:\fitness_prog\start-notifications.cmd
```

---

## Prod (кратко)

На сервере нужен **отдельный процесс worker** с тем же image/кодом:

```bash
arq app.tasks.notifications.WorkerSettings
```

+ managed Redis (`REDIS_URL`), валидный `BOT_TOKEN`, webhook/mini app URL.  
См. также [docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md), [docker-compose.yml](docker-compose.yml) (сервис `worker` + `redis`).

---

## Мини-схема

```
[Профиль: сохранить расписание]
        ↓
   Postgres (users.goals)
        ↓
[ARQ worker каждую минуту] ←→ Redis
        ↓
 due_notifications() → Telegram Bot API → чат пользователя
```

---

*Файл можно держать открытым на рабочем столе/в проводнике рядом с `start-notifications.cmd`.*

## Таймер отдыха в тренировке

При окончании таймера отдыха (или hold) Mini App вызывает:

`POST /notifications/timer-ended`

Тело: `kind` (rest|hold), `title`, `text`, опционально `workout_id`, `startapp`.

Бот сразу пишет в личку (нужны `BOT_TOKEN` и `/start` у пользователя). Это не cron worker — сообщение уходит из API-процесса.

