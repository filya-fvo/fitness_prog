# Fitness Mini App: простая инструкция владельца VPS

Эта инструкция описывает уже работающий production-сервер Fitness Mini App в Timeweb.
Она нужна для повседневного контроля, просмотра базы, обновления приложения и
первичной диагностики. Для первоначальной установки сервера используйте
`docs/VPS_DEPLOYMENT_GUIDE.md`.

## 1. Что сейчас работает на VPS

Сервер Timeweb имеет публичный IP `201.24.48.145`. Приложение доступно по двум адресам:

- интерфейс: <https://app.filfitclub.ru>;
- API и проверка состояния: <https://api.filfitclub.ru/health>.

На сервере Docker Compose запускает шесть частей:

| Сервис | Для чего нужен |
|---|---|
| `web` | React-интерфейс приложения |
| `api` | FastAPI, авторизация и вся бизнес-логика |
| `worker` | уведомления Telegram и фоновые задачи |
| `db` | PostgreSQL 18 с данными пользователей |
| `redis` | очередь фоновых задач и временные блокировки |
| `caddy` | HTTPS и направление запросов к `web`/`api` |

Исходный код находится в `/opt/fitness/source`. База хранится в Docker volume,
а не внутри Git-репозитория. Production-ветка GitHub —
`timeweb-production-20260825` репозитория
<https://github.com/filya-fvo/fitness_prog>.

## 2. Как зайти на сервер

На своём Windows-компьютере откройте обычный **PowerShell** и выполните:

```powershell
ssh -i "$env:USERPROFILE\.ssh\fitness_timeweb" root@201.24.48.145
```

Если появится вопрос о доверии серверу, один раз введите `yes`. После входа строка
начнётся примерно с `root@fitness-prod-vps` — теперь команды выполняются на VPS.

Перейдите в каталог приложения:

```bash
cd /opt/fitness/source
```

Чтобы выйти с VPS:

```bash
exit
```

Не отправляйте никому файл `fitness_timeweb` из папки `.ssh`: это ключ доступа к серверу.

## 3. Самая быстрая проверка состояния

На VPS выполните:

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production ps
```

Нормальное состояние:

- `api`, `db`, `redis`, `web` — `Up` и `healthy`;
- `worker`, `caddy` — `Up`;
- `migrate` может быть `Exited (0)` — это нормально: он выполняет миграции и завершает работу.

Затем проверьте публичные адреса:

```bash
curl --fail --silent https://api.filfitclub.ru/health
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' https://app.filfitclub.ru/
```

Ожидается `{"status":"ok"}` и код `200`.

Без SSH тот же срез доступен настроенному администратору в приложении:
**Ещё → Админ → Состояние системы**. Экран работает только на чтение и не
перезапускает сервисы. Ниже текущего среза находится история: worker сохраняет
безопасные статусы каждые 15 минут, ручная кнопка также создаёт снимок. В интерфейсе
видны примерно последние семь дней, в PostgreSQL записи хранятся 30 дней; полные
тексты диагностики, адреса и секреты в историю не записываются.
Рядом находится **Журнал действий**: он показывает административные изменения,
их результат и correlation ID. Журнал также работает только на чтение; записи
защищены от `UPDATE` и `DELETE` на уровне PostgreSQL.
Чтобы карточка PostgreSQL оставалась доступна при полном отказе БД, у владельца
должен быть указан стабильный numeric ID в `ADMIN_TELEGRAM_IDS`: backend сверяет
его только с подписанным JWT. Username-доступ без живой БД намеренно не используется.

## 4. Как смотреть логи

Последние 100 строк основных сервисов:

```bash
docker compose --env-file backend/.env.production logs --tail=100 api worker caddy
```

Смотреть новые строки в реальном времени:

```bash
docker compose --env-file backend/.env.production logs --follow --tail=50 api worker
```

Остановить просмотр — `Ctrl+C`. Это не останавливает приложение.

Отдельные варианты:

```bash
docker compose --env-file backend/.env.production logs --tail=100 api
docker compose --env-file backend/.env.production logs --tail=100 worker
docker compose --env-file backend/.env.production logs --tail=100 caddy
docker compose --env-file backend/.env.production logs --tail=100 db
```

В отчёты и сообщения нельзя копировать токены, OTP-коды, пароли, полные HTTP-заголовки
и персональные данные пользователей.

## 5. Как зайти в PostgreSQL

Находясь в `/opt/fitness/source`, выполните:

```bash
docker compose --env-file backend/.env.production exec db psql -U fitness -d fitness
```

Появится приглашение вида `fitness=#`. Теперь вы внутри PostgreSQL.

Полезные команды `psql`:

```text
\l                 список баз данных
\dt                список таблиц приложения
\d users           описание таблицы users
\d workouts        описание таблицы workouts
\dx                установленные расширения PostgreSQL
\conninfo          текущее подключение
\q                 выйти из PostgreSQL
```

Команды с обратной косой чертой не заканчиваются точкой с запятой. Обычные SQL-запросы
обязательно заканчиваются `;`.

## 6. Какие таблицы есть в приложении

| Таблица | Что хранит |
|---|---|
| `users` | аккаунты, профиль, цели и настройки |
| `programs` | каталог тренировочных программ |
| `exercises` | каталог упражнений и ссылки на медиа |
| `workouts` | тренировки пользователей и их состояние |
| `workout_sets` | выполненные подходы внутри тренировок |
| `workout_plan_overrides` | замены упражнений, подготовленные до старта |
| `nutrition_products` | справочник продуктов |
| `nutrition_logs` | записи дневника питания |
| `daily_metrics` | сон, шаги и активность по дням |
| `body_measurements` | вес, обхваты и остальные замеры тела |
| `supplement_intakes` | приём добавок |
| `web_push_subscriptions` | подписки браузеров на push |
| `email_otp_codes` | временные коды входа по email |
| `ai_conversations` | история обращений к ИИ-тренеру |
| `admin_audit_log` | неизменяемый журнал действий администраторов |
| `admin_system_snapshots` | безопасная 30-дневная история системных статусов |
| `fitness_schema_migrations` | журнал уже применённых production-миграций |

Актуальный список всегда смотрите командой `\dt`: новые миграции могут добавлять таблицы.

## 7. Безопасные примеры просмотра данных

Количество строк во всех пользовательских таблицах:

```sql
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'workouts', count(*) FROM workouts
UNION ALL SELECT 'workout_sets', count(*) FROM workout_sets
UNION ALL SELECT 'nutrition_logs', count(*) FROM nutrition_logs
UNION ALL SELECT 'daily_metrics', count(*) FROM daily_metrics
ORDER BY table_name;
```

Последние тренировки без вывода лишних данных:

```sql
SELECT id, user_id, scheduled_date, status, title
FROM workouts
WHERE is_deleted = false
ORDER BY created_at DESC
LIMIT 20;
```

Сколько активных пользователей привязано к Telegram:

```sql
SELECT count(*)
FROM users
WHERE telegram_id IS NOT NULL AND is_deleted = false;
```

Последние дневные показатели:

```sql
SELECT user_id, date, sleep_minutes, steps, active_minutes
FROM daily_metrics
WHERE is_deleted = false
ORDER BY date DESC
LIMIT 20;
```

Последние замеры веса:

```sql
SELECT user_id, date, weight_kg
FROM body_measurements
WHERE is_deleted = false AND weight_kg IS NOT NULL
ORDER BY date DESC
LIMIT 20;
```

Дневная вода пока хранится в JSON-настройках `users.goals`, а не в `daily_metrics`.
Не редактируйте этот JSON вручную.

Чтобы PostgreSQL показывал широкую запись вертикально, включите:

```text
\x on
```

Используйте только `SELECT`, пока точно не понимаете последствия. Не выполняйте вручную
`DELETE`, `UPDATE`, `DROP`, `TRUNCATE` или `ALTER` на production. Исправления структуры
делаются миграциями из `supabase/migrations/` и сначала проверяются тестами.

## 8. Резервные копии

Ежедневная копия PostgreSQL создаётся автоматически примерно в 03:15 UTC:

```bash
systemctl is-active fitness-backup.timer
systemctl list-timers fitness-backup.timer
```

Последний результат:

```bash
journalctl -u fitness-backup.service -n 50 --no-pager
ls -lh /opt/fitness/backups/daily
```

Создать дополнительную копию вручную:

```bash
cd /opt/fitness/source
BACKUP_DIR=/opt/fitness/backups/manual sh scripts/backup_vps.sh
```

Сценарий сам проверит, что dump читается, и создаст файл `.sha256`.
Он также атомарно обновит `/opt/fitness/status/backup.json`; в файл попадают
только результат и UTC-время, без пути к dump и параметров базы.

Скачать копию с VPS на Windows, выполняя команду уже в локальном PowerShell:

```powershell
scp -i "$env:USERPROFILE\.ssh\fitness_timeweb" `
  root@201.24.48.145:/opt/fitness/backups/daily/ИМЯ_ФАЙЛА.dump `
  "$env:USERPROFILE\Downloads\"
```

Копии на том же VPS не защищают от потери всего диска. Хотя бы раз в неделю храните
свежий dump на другом устройстве. Восстановление production-базы заменяет данные;
не запускайте его без отдельной свежей копии и проверки SHA-256.

## 9. Как обновляется приложение

Правильный путь всегда такой:

```text
изменение → тесты → commit → GitHub → backup VPS → pull → build → migrations → health-check
```

После того как проверенный commit уже отправлен в ветку
`timeweb-production-20260825`, на VPS выполните:

```bash
cd /opt/fitness/source
BACKUP_DIR=/opt/fitness/backups sh scripts/backup_vps.sh
git status --short
git pull --ff-only origin timeweb-production-20260825
docker compose --env-file backend/.env.production config --quiet
docker compose --env-file backend/.env.production build api worker web
docker compose --env-file backend/.env.production run --rm migrate
docker compose --env-file backend/.env.production up -d
sh scripts/write-admin-system-status.sh
docker compose --env-file backend/.env.production ps
curl --fail --silent https://api.filfitclub.ru/health
```

`git status --short` перед обновлением должен быть пустым. Если там появились файлы,
не удаляйте и не перезаписывайте их вслепую — сначала выясните происхождение.

`write-admin-system-status.sh` записывает текущий commit, версию, время deploy и,
если сертификат доступен, срок его действия в `/opt/fitness/status`. API видит этот
каталог через read-only mount; скрипт не читает и не печатает секреты из env.

Секреты находятся только в `backend/.env.production`. Этот файл не коммитится и не
должен заменяться примером `.env.production.example`.

## 10. Перезапуск без обновления кода

Перезапустить только API:

```bash
docker compose --env-file backend/.env.production restart api
```

Перезапустить worker уведомлений:

```bash
docker compose --env-file backend/.env.production restart worker
```

Перезапустить весь набор контейнеров без удаления данных:

```bash
docker compose --env-file backend/.env.production restart
```

После этого обязательно выполните `docker compose ... ps` и проверку `/health`.

Не используйте `docker compose down -v`: ключ `-v` удаляет volumes, включая базу данных.

## 11. Диск, память и нагрузка

Свободное место на диске:

```bash
df -h
du -sh /opt/fitness/backups/*
docker system df
```

Память и текущая нагрузка:

```bash
free -h
uptime
docker stats --no-stream
```

Не запускайте `docker system prune --volumes`: эта команда может удалить данные.
Старые образы и backup удаляйте только после проверки точных путей и наличия другой копии.

## 12. HTTPS, домен и Telegram

DNS управляется в Timeweb. Cloudflare в production не используется. Записи:

- `app.filfitclub.ru` → `201.24.48.145`;
- `api.filfitclub.ru` → `201.24.48.145`.

Caddy автоматически получает и продлевает сертификаты Let's Encrypt. Проверить его логи:

```bash
docker compose --env-file backend/.env.production logs --tail=100 caddy
```

Telegram webhook должен вести на:

```text
https://api.filfitclub.ru/telegram/webhook
```

Ручная `web_app`/Menu Button должна открывать:

```text
https://app.filfitclub.ru/
```

После изменения адресов используйте `scripts/setup_telegram_bot.ps1` с локального
Windows-компьютера. Не вставляйте BOT_TOKEN в командную строку или переписку.

## 13. Частые проблемы

### Сайт показывает 502

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production ps
docker compose --env-file backend/.env.production logs --tail=100 api web caddy
```

Если API только что пересоздан, подождите до появления `healthy` и повторите `/health`.

### Бот не отвечает на `/start`

1. Проверьте `https://api.filfitclub.ru/health`.
2. Посмотрите последние логи `api`.
3. Проверьте, что webhook указывает на Timeweb и pending updates не растут.
4. Не запускайте одновременно локальный и VPS worker.

### Не приходят уведомления

```bash
docker compose --env-file backend/.env.production ps worker redis
docker compose --env-file backend/.env.production logs --tail=100 worker
docker compose --env-file backend/.env.production exec -T redis redis-cli ping
```

Ожидается `PONG`. В строках `scheduled_dispatch` поле `errors` должно быть `0`.

Если из карточки пользователя не отправляется инструкция, проверьте, что оба
канонических документа вошли в текущий API-образ:

```bash
docker compose --env-file backend/.env.production exec -T api test -s /docs/USER_GUIDE.md
docker compose --env-file backend/.env.production exec -T api test -s /docs/LOCAL_ADMIN_GUIDE.md
```

Обе команды должны завершиться с кодом `0`. Ошибка `User guide not found` в
логах `api` означает, что запущен старый образ: обновите репозиторий и пересоберите
`api` из корневого Docker context по штатной процедуре обновления.

После изменений Telegram-доставки используйте только выделенный тестовый аккаунт.
Добавьте его числовой ID в `ADMIN_SMOKE_TELEGRAM_ID` файла
`backend/.env.production`, затем сначала выполните read-only проверку:

```bash
docker compose --env-file backend/.env.production exec -T api \
  python scripts/smoke_telegram_delivery.py
```

Для трёх реальных сообщений — служебного, руководства и тестовой рассылки — нужен
явный флаг:

```bash
docker compose --env-file backend/.env.production exec -T api \
  python scripts/smoke_telegram_delivery.py --write
```

Скрипт не строит аудиторию и не принимает ID из командной строки, поэтому не
может превратиться в массовую отправку. Без настроенного ID он завершается до
обращения к Telegram.

### Не приходит письмо с OTP

```bash
docker compose --env-file backend/.env.production logs --tail=100 api
```

Проверьте SMTP-настройки в Timeweb и отсутствие новой блокировки исходящих портов.
Не выводите значение SMTP-пароля.

### Заканчивается место

Сначала выполните команды из раздела 11 и определите, что именно занимает диск.
Не удаляйте Docker volumes и PostgreSQL-каталог. Скачайте важные backup на другое
устройство до любой очистки.

## 14. Что нельзя делать

- Не выполнять `docker compose down -v`.
- Не удалять `/opt/fitness`, Docker volumes или каталог backup целиком.
- Не редактировать production-базу через `DELETE`/`UPDATE` без backup и проверенного запроса.
- Не хранить пароли, токены и `.env.production` в GitHub или сообщениях.
- Не включать второй worker на локальном компьютере одновременно с VPS-worker.
- Не возвращать Cloudflare в DNS, proxy или runtime проекта.
- Не делать `git reset --hard` при непонятном состоянии сервера.
- Не считать локальный commit опубликованным, пока он не отправлен в GitHub и не развёрнут на VPS.

## 15. Короткий еженедельный контроль

1. Открыть сайт и войти в приложение.
2. Отправить боту `/start` и проверить кнопку `Open`.
3. Проверить `docker compose ... ps`.
4. Проверить `/health` и логи worker на `errors: 0`.
5. Проверить последний ежедневный backup.
6. Скачать свежий dump на другое устройство.
7. Проверить свободное место командой `df -h`.

Если действие может удалить или заменить данные, сначала остановитесь, создайте backup
и отдельно подтвердите точную команду и её цель.
