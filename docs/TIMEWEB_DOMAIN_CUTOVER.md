# Timeweb production без локального компьютера

Эта инструкция рассчитана на текущую конфигурацию проекта и панели Timeweb.
Действуйте по порядку. Локальный Supervisor и Tailscale продолжают работать до
самого конца и остаются способом быстрого отката.

## Что уже готово

По состоянию на 25 августа 2026 года:

- создана приватная сеть `fitness-prod` (`192.168.0.0/24`, Москва);
- создан PostgreSQL-кластер `fitness-prog`;
- создана база `fitness` и пользователь `fitness_app`;
- база подключена к сети как `192.168.0.4`;
- базе выдан публичный IPv4; защищённое подключение включено;
- включены `pgvector`, `pg_trgm`, `pgcrypto`, `uuid-ossp`.

В панели расширение называется `pgvector`, а внутри PostgreSQL — `vector`. Это
правильно.

## Итоговая схема

```text
Telegram / браузер
        ↓
https://app.filfitclub.ru
        ↓
Timeweb App Platform
React + FastAPI + ARQ worker
        ├── TLS → Timeweb PostgreSQL
        └── TLS → Timeweb Valkey
```

Cloudflare в этой схеме не используется. Интерфейс, API и Telegram webhook
работают на одном домене `app.filfitclub.ru`.

App Platform не добавляется в пользовательскую VPC как облачный сервер. Поэтому
для PostgreSQL и Valkey нужны защищённые публичные адреса. Их пароли должны быть
длинными, а в строках подключения обязателен TLS.

## Важные правила

1. Не отключайте локальный Supervisor и Tailscale.
2. Не переключайте Telegram до отдельного финального шага.
3. Не запускайте первый deploy до импорта данных в пустую Timeweb-базу.
4. Не отправляйте пароли, токены или строки подключения в чат и GitHub.
5. Не удаляйте локальную PostgreSQL и резервные копии после переключения.

## Шаг 1. Создать Valkey

Valkey нужен для уведомлений, очередей и ограничения запросов.

1. В Timeweb откройте **Базы данных**.
2. Нажмите **Добавить**.
3. Выберите **Valkey 7**.
4. Регион — **Москва**, как у PostgreSQL.
5. Имя — `fitness-valkey`.
6. Выберите минимальную подходящую конфигурацию.
7. Подключите сеть `fitness-prod`.
8. Включите публичный IPv4 и защищённое подключение.
9. Сохраните пароль пользователя `default` в менеджере паролей.

Для Valkey потребуется отдельный публичный IP: один IP нельзя одновременно
привязать к PostgreSQL и Valkey.

После создания на вкладке **Подключение** выберите публичный IPv4 и защищённое
подключение. Итоговая строка должна начинаться с `rediss://`, не `redis://`.

## Шаг 2. Перенести DNS с Cloudflare в Timeweb

Сейчас NS домена указывают на Cloudflare. Сначала подготовьте зону в Timeweb, и
только потом меняйте NS.

1. Откройте Timeweb → **Домены и SSL** → **Добавить домен**.
2. Добавьте `filfitclub.ru` как технический перенос.
3. До изменения NS проверьте записи в Timeweb:

```text
MX   @   10 mx1.timeweb.ru
MX   @   20 mx2.timeweb.ru
TXT  @   v=spf1 include:_spf.timeweb.ru ~all
```

4. Если в старой DNS-зоне есть другие нужные записи почты или подтверждений,
   перенесите их в Timeweb без изменений.
5. У регистратора домена установите все четыре NS:

```text
ns1.timeweb.ru
ns2.timeweb.ru
ns3.timeweb.org
ns4.timeweb.org
```

6. Дождитесь применения. Обычно это занимает от 3 до 24 часов.

Проверка в PowerShell:

```powershell
Resolve-DnsName filfitclub.ru -Type NS
```

Продолжайте только когда в ответе видны NS Timeweb. Локальная Telegram Mini App
всё это время продолжает открываться через Tailscale.

## Шаг 3. Подготовить код для App Platform

Timeweb собирает корневой `Dockerfile` из GitHub. Production-ветка проекта:

```text
timeweb-production-20260825
```

Перед созданием приложения ветка должна быть отправлена в GitHub, а GitHub CI —
завершиться без ошибок.

## Шаг 4. Сделать свежую копию локальной базы

Локальное приложение останавливать не нужно: `pg_dump` создаёт согласованный
снимок работающей PostgreSQL.

В PowerShell из `C:\fitness_prog` выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-local-postgres-for-timeweb.ps1
```

Скрипт выведет путь, размер и SHA-256 файла. Архив сохраняется в
`backups\timeweb-cutover` и не попадает в Git.

С момента создания этого дампа и до переключения Telegram не записывайте новые
тренировки или питание. Сам локальный сайт остаётся включённым.

## Шаг 5. Импортировать данные в Timeweb

Убедитесь, что приложение App Platform ещё не запускалось и база `fitness`
остаётся без таблиц. Затем выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\import-postgres-to-timeweb.ps1 `
  -DumpPath "ПОЛНЫЙ_ПУТЬ_К_DUMP"
```

Скрипт скрыто попросит публичную строку подключения PostgreSQL. Используйте
вариант с защищённым подключением из панели Timeweb. Пароль не появится на экране
и не будет записан в файл.

Если в базе уже есть хотя бы одна таблица, импорт остановится без изменений.
Не удаляйте таблицы вручную и не используйте `--clean`.

## Шаг 6. Создать приложение App Platform

1. Откройте **App Platform** → **Создать приложение**.
2. Выберите деплой из **Dockerfile**.
3. Подключите GitHub и выберите репозиторий Fitness Mini App.
4. Ветка — `timeweb-production-20260825`.
5. Путь к директории проекта оставьте пустым: Dockerfile находится в корне.
6. Регион — Москва.
7. Один экземпляр, 1 CPU и 2 ГБ RAM для первого запуска.
8. Порт — `8000`.
9. Путь проверки состояния — `/health`.
10. Автодеплой можно включить после первого успешного запуска.

Timeweb выдаст бесплатный технический HTTPS-домен. Сохраните его для первой
проверки.

## Шаг 7. Добавить переменные приложения

Откройте приложение → **Переменные**. Шаблон находится в
`deploy/timeweb/timeweb.env.example`.

Обязательные переменные:

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
BOT_USERNAME=fil_fit_bot
```

Для `DATABASE_URL`:

1. Возьмите публичную защищённую строку PostgreSQL из Timeweb.
2. Замените начало `postgresql://` на `postgresql+asyncpg://`.
3. Добавьте в конец `?ssl=require`.

Пример формы, не готовое значение:

```text
postgresql+asyncpg://fitness_app:ПАРОЛЬ@ПУБЛИЧНЫЙ_IP:5432/fitness?ssl=require
```

Для `REDIS_URL` скопируйте защищённую строку Valkey. Она должна начинаться с
`rediss://`. Если пароль содержит `@`, `:`, `/`, `?` или `#`, используйте уже
URL-кодированный вариант из панели Timeweb.

Чтобы сохранить все функции приложения, перенесите из локального `backend/.env`
также Groq, SMTP, VAPID и административные переменные. Значения показывать в чате
не нужно.

## Шаг 8. Первый deploy и проверка технического домена

Запустите deploy. В логах должны появиться строки:

```text
[timeweb] production environment validated
[migration] complete ...
[timeweb] starting API and notification worker
```

Проверьте технический домен:

```powershell
curl.exe --fail https://ТЕХНИЧЕСКИЙ-ДОМЕН/health
curl.exe -sS --max-time 20 -o NUL -w "status=%{http_code}`n" https://ТЕХНИЧЕСКИЙ-ДОМЕН/
```

Ожидается `{"status":"ok"}` и `status=200`. Если deploy красный, не меняйте
Telegram: откройте лог и исправьте первую ошибку.

## Шаг 9. Подключить app.filfitclub.ru

1. App Platform → приложение → **Настройки** → **Домены** → **Редактировать**.
2. Выберите домен из панели Timeweb.
3. Добавьте поддомен `app.filfitclub.ru`.
4. Сохраните и дождитесь автоматического SSL.

Timeweb сам создаст или обновит нужную A-запись, если домен уже делегирован на
его NS.

Проверка:

```powershell
curl.exe --fail https://app.filfitclub.ru/health
curl.exe -sS --max-time 20 -o NUL -w "status=%{http_code}`n" https://app.filfitclub.ru/
```

Ожидается `{"status":"ok"}` и `status=200`.

## Шаг 10. Проверить данные без переключения Telegram

Пока Telegram всё ещё открывает Tailscale, проверьте Timeweb напрямую в обычном
браузере:

1. откройте `https://app.filfitclub.ru`;
2. войдите через email OTP;
3. убедитесь, что видны программа, история и последние записи;
4. не создавайте тестовую тренировку в production-базе;
5. в логах Timeweb убедитесь, что API и worker не перезапускаются.

## Шаг 11. Переключить Telegram

Только после успешных шагов 8–10 выполните из `C:\fitness_prog`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\setup_telegram_bot.ps1 `
  -MiniAppUrl "https://app.filfitclub.ru" `
  -WebhookBase "https://app.filfitclub.ru"
```

Проверьте:

1. тип Menu Button — `web_app`;
2. адрес — `https://app.filfitclub.ru`;
3. `/start` открывает новую версию;
4. авторизация, главная, история и уведомления работают.

## Шаг 12. Удалить остатки Cloudflare

Когда `Resolve-DnsName filfitclub.ru -Type NS` показывает только Timeweb и новое
приложение стабильно работает:

1. удалите зону `filfitclub.ru` из панели Cloudflare;
2. если в Windows был установлен `cloudflared`, остановите и отключите его;
3. не удаляйте и не отключайте Tailscale/Supervisor ещё 24 часа.

Проверка Windows:

```powershell
Get-Service cloudflared -ErrorAction SilentlyContinue
```

Если сервис существует, запустите PowerShell от администратора:

```powershell
Stop-Service cloudflared
Set-Service cloudflared -StartupType Disabled
```

## Шаг 13. Отключить зависимость от локального компьютера

После минимум 24 часов стабильной работы Timeweb:

1. проверьте Telegram ещё раз с телефона;
2. проверьте email OTP и уведомление;
3. включите backup PostgreSQL в Timeweb;
4. задайте в GitHub Actions variable:

```text
PUBLIC_HEALTH_URL=https://app.filfitclub.ru/health
```

5. только теперь локальный Supervisor/Tailscale можно остановить.

Локальную PostgreSQL и дампы не удаляйте. Они остаются аварийной копией.

## Откат

Пока локальный Supervisor/Tailscale работает, откат простой: снова укажите его
URL в Telegram Menu Button и webhook. Переключение Telegram не удаляет данные ни
в локальной, ни в Timeweb-базе.

Официальные инструкции Timeweb:

- [деплой из Dockerfile](https://timeweb.cloud/docs/apps/deploying-with-dockerfile);
- [переменные App Platform](https://timeweb.cloud/docs/apps/variables);
- [healthcheck](https://timeweb.cloud/docs/apps/healthcheck-path);
- [домены App Platform](https://timeweb.cloud/docs/apps/upravlenie-apps-v-paneli);
- [технический перенос домена](https://timeweb.cloud/docs/domains/domain-technical-transfer);
- [DNS и NS Timeweb](https://timeweb.cloud/docs/domains/dns-records-management);
- [публичный доступ PostgreSQL](https://timeweb.cloud/docs/dbaas/dbaas-manage/public-ip-access);
- [создание PostgreSQL/Valkey](https://timeweb.cloud/docs/dbaas/dbaas-create).
