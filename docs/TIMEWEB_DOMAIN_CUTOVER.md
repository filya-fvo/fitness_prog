# Запуск filfitclub.ru в Timeweb без VPS

Это основная production-схема проекта:

```text
app.filfitclub.ru ─┐
                   ├─ Timeweb App Platform: React + FastAPI + ARQ worker
api.filfitclub.ru ─┘              │
                         ┌────────┴────────┐
                  Timeweb PostgreSQL   Timeweb Valkey
```

Локальный компьютер для работы сайта не нужен. Cloudflare Tunnel, Tailscale и
Windows Supervisor после переноса production не обслуживают публичное приложение.

## До начала

- Не отключайте текущий Cloudflare Tunnel до завершения всех проверок.
- Сделайте снимки текущих DNS-записей `app` и `api`, чтобы можно было откатиться.
- Не отправляйте токены и пароли в чат и не добавляйте их в Git.
- Для первого запуска используйте одну реплику приложения. Один контейнер уже
  запускает API и worker; несколько реплик пока не нужны.

## Шаг 1. Отправить код в GitHub

После прохождения локальных проверок закоммитьте изменения и отправьте ветку в
GitHub. Timeweb будет собирать приложение прямо из репозитория.

В GitHub не нужно добавлять Timeweb API token. Приложение его не использует.
Timeweb подключается к GitHub через кнопку авторизации в своей панели.

## Шаг 2. Создать приватную сеть Timeweb

В Timeweb Cloud создайте одну VPC/приватную сеть, например `fitness-prod`.
Выберите один регион для сети, базы, Valkey и приложения. Регион и сеть приложения
после создания менять неудобно, поэтому проверьте их до подтверждения.

## Шаг 3. Создать PostgreSQL

1. Откройте **Базы данных → Создать → PostgreSQL**.
2. Выберите PostgreSQL 18, тот же регион и сеть `fitness-prod`.
3. Назовите базу и пользователя, например `fitness`.
4. Включите резервные копии.
5. В разделе расширений включите:
   `vector`, `pg_trgm`, `pgcrypto`, `uuid-ossp`.
6. Сохраните приватную строку подключения в менеджере паролей. Именно её позже
   укажите приложению. В Git её не добавляйте.

Для приложения строка должна начинаться с `postgresql+asyncpg://`. Если Timeweb
показывает `postgresql://`, замените только начало. Спецсимволы в логине и пароле
должны быть URL-кодированы.

## Шаг 4. Создать Valkey

1. Откройте **Базы данных → Создать → Valkey**.
2. Выберите тот же регион и сеть `fitness-prod`.
3. Сохраните строку подключения. Она начинается с `redis://` или `rediss://`.

Valkey совместим с Redis. Отдельный Redis-сервер не нужен.

## Шаг 5. Перенести текущие данные

Если старые пользователи и тренировки должны сохраниться, в PowerShell из
`C:\fitness_prog` выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-local-postgres-for-timeweb.ps1
```

Скрипт покажет путь к файлу `.dump`. Для импорта временно включите у PostgreSQL
доступ по публичному IPv4 и возьмите внешнюю строку подключения. Затем
импортируйте данные в ещё пустую базу Timeweb:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-postgres-to-timeweb.ps1 -DumpPath "ПОЛНЫЙ_ПУТЬ_К_DUMP"
```

Скрипт скрыто попросит внешнюю строку подключения Timeweb, проверит, что база
пустая, и не сохранит пароль. После успешного импорта отключите публичный IPv4 у
базы. App Platform будет подключаться по приватному адресу. Если нужен полностью
новый проект без старых данных, этот шаг можно пропустить.

## Шаг 6. Создать приложение в App Platform

1. Откройте **App Platform → Создать приложение → Dockerfile**.
2. Подключите GitHub и выберите репозиторий проекта и production-ветку.
3. Поле **Путь к директории проекта** оставьте пустым. Timeweb найдёт корневой
   `Dockerfile` и получит доступ к `frontend`, `backend` и миграциям.
4. Выберите сеть `fitness-prod` и тот же регион.
5. Для начала выберите один экземпляр, 1 CPU и 2 ГБ RAM.
6. Порт приложение возьмёт из Dockerfile: `8000`. Если панель попросит порт
   вручную, укажите `8000`.
7. Healthcheck path: `/health`.

Контейнер не хранит пользовательские данные на своём диске: постоянные данные
находятся в PostgreSQL и Valkey. При каждом релизе контейнер безопасно применяет
миграции, синхронизирует каталоги и запускает API вместе с worker.

## Шаг 7. Заполнить переменные в Timeweb

Откройте приложение → **Переменные окружения**. Перенесите названия из
`deploy/timeweb/timeweb.env.example`, а реальные значения вводите только в панели
Timeweb.

Обязательный минимум:

```dotenv
ENVIRONMENT=production
MINI_APP_URL=https://app.filfitclub.ru
CORS_ORIGINS=https://web.telegram.org,https://app.filfitclub.ru
EMAIL_OTP_DEV_RETURN_CODE=false
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=rediss://...
JWT_SECRET=...
BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
BOT_USERNAME=...
```

- `DATABASE_URL` и `REDIS_URL` возьмите из созданных сервисов Timeweb. Для
  production используйте их приватные адреса из сети `fitness-prod`.
- `JWT_SECRET`, `BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` перенесите из локального
  `backend/.env`, не показывая их и не копируя в документацию.
- `BOT_USERNAME` указывается без `@`.
- `LLM_API_KEY`, SMTP, VAPID и Sentry нужны только для соответствующих функций.
- `TIMEWEB_CLOUD_TOKEN` здесь не нужен.

## Шаг 8. Первый запуск на техническом домене

Запустите deployment. В логах должны последовательно появиться строки:

```text
[timeweb] production environment validated
[migration] complete ...
[timeweb] starting API and notification worker
```

Проверьте технический адрес, выданный App Platform:

```powershell
curl.exe --fail https://ТЕХНИЧЕСКИЙ-ДОМЕН/health
curl.exe --fail -o NUL https://ТЕХНИЧЕСКИЙ-ДОМЕН/
```

Первый ответ должен быть `{"status":"ok"}`, обе команды должны завершиться без
ошибки. Если deployment красный, не меняйте DNS: сначала исправьте первую ошибку
в логах.

## Шаг 9. Подключить домены

1. В настройках приложения Timeweb откройте **Домены**.
2. Добавьте внешний домен `app.filfitclub.ru`.
3. Добавьте внешний домен `api.filfitclub.ru`.
4. Timeweb покажет адрес назначения для DNS — скопируйте его.
5. В Cloudflare → **DNS** удалите старые Tunnel/CNAME-записи только для `app` и
   `api` и создайте записи, которые показал Timeweb. Обычно это две A-записи на
   один IP.
6. На время первого запуска установите **DNS only** (серое облако), TTL Auto.
7. Дождитесь, пока в Timeweb для обоих доменов появится активный SSL.

Не меняйте nameserver домена и не удаляйте сам домен из Timeweb. Сейчас DNS
управляется в Cloudflare; мы меняем только две записи.

Проверка:

```powershell
curl.exe --fail https://api.filfitclub.ru/health
curl.exe -sS --max-time 20 -o NUL -w "app=%{http_code} time=%{time_total}s`n" https://app.filfitclub.ru/
```

Ожидается `{"status":"ok"}` и `app=200`. Сначала оставьте записи в режиме
DNS only. Так Cloudflare не будет промежуточным звеном между пользователем и
Timeweb.

## Шаг 10. Переключить Telegram

Только после успешной проверки обоих доменов из `C:\fitness_prog` выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup_telegram_bot.ps1 -MiniAppUrl "https://app.filfitclub.ru" -WebhookBase "https://api.filfitclub.ru"
```

Если Main Mini App задавался вручную, в BotFather установите
`https://app.filfitclub.ru`. Затем отправьте боту `/start` и откройте новую кнопку.

## Шаг 11. Настроить проверку GitHub

В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и
создайте обычную переменную:

```text
PUBLIC_HEALTH_URL=https://api.filfitclub.ru/health
```

Затем вручную запустите workflow **Public health monitor**. Секреты приложения и
Timeweb API token в GitHub для этой схемы не нужны.

## Шаг 12. Отключить старый локальный туннель

Сначала убедитесь, что сайт стабильно работает хотя бы сутки. Потом запустите
PowerShell от администратора:

```powershell
Stop-Service cloudflared
Set-Service cloudflared -StartupType Disabled
```

Windows Supervisor можно оставить для локальной разработки или удалить его
плановую задачу. Production от него больше не зависит. Tailscale также не нужен
для публичной работы приложения.

## Откат

Если новый deployment не работает, верните в Cloudflare сохранённые старые
записи `app` и `api` и снова запустите `cloudflared`. Telegram не переключайте,
пока домены нового приложения не прошли проверку.

Официальные справки: [App Platform и Dockerfile](https://timeweb.cloud/docs/apps/deploying-with-dockerfile),
[переменные](https://timeweb.cloud/docs/apps/variables),
[домены приложения](https://timeweb.cloud/docs/apps/upravlenie-apps-v-paneli),
[healthcheck](https://timeweb.cloud/docs/apps/healthcheck-path),
[PostgreSQL](https://timeweb.cloud/docs/dbaas/dbaas-create),
[подключение PostgreSQL](https://timeweb.cloud/docs/dbaas/postgresql/connect-to-database),
[Valkey](https://timeweb.cloud/docs/dbaas/valkey/connect-to-database).
