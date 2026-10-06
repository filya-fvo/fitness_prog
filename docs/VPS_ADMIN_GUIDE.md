# Fitness Mini App: простая инструкция владельца VPS

Проверено **2 октября 2026 года** по production-серверу и текущим Compose/скриптам.
Все команды `bash` ниже выполняются после SSH-входа на VPS; команды `powershell`
— на Windows-компьютере владельца. Если действие завершается ошибкой, сначала
разберите её, а не продолжайте следующие шаги обновления или восстановления.

Эта инструкция описывает уже работающий production-сервер Fitness Mini App в Timeweb.
Она нужна для повседневного контроля, просмотра базы, обновления приложения и
первичной диагностики. Для первоначальной установки сервера используйте
`docs/VPS_DEPLOYMENT_GUIDE.md`.

Работа со встроенной админкой, пользователями, рассылками, поддержкой, упражнениями
и программами описана в [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md).

## 1. Что сейчас работает на VPS

Сервер Timeweb имеет публичный IP `201.24.48.145`. Приложение доступно по двум адресам:

- интерфейс: <https://app.filfitclub.ru>;
- API и проверка состояния: <https://api.filfitclub.ru/health>.

На сервере Docker Compose запускает девять постоянных частей:

| Сервис | Для чего нужен |
|---|---|
| `web` | React-интерфейс приложения |
| `api` | FastAPI, авторизация и вся бизнес-логика |
| `worker` | уведомления Telegram и фоновые задачи |
| `db` | PostgreSQL 18 с данными пользователей |
| `redis` | очередь фоновых задач и временные блокировки |
| `caddy` | HTTPS и направление запросов к `web`/`api` |
| `llm` | локальный llama.cpp с Qwen3-1.7B Q4_K_M, только текст, thinking отключён |
| `ocr` | закрытый PP-OCRv5 mobile / Cyrillic mobile для этикеток, Tesseract для отката |
| `telegram-poller` | исходящий Telegram long polling, внутренняя доставка API |

Отдельный `migrate` применяет SQL и завершается. При проверке 02.10.2026 все
девять сервисов работали, `migrate` завершился с кодом `0`; исходный каталог был
чистым, commit — `497e92ff3c67bfd0629ac575928dd183378bf932`. Это датированный
срез, а не значение, которое нужно вручную возвращать после каждого обновления.

Hostname: `fitness-prod-vps`. PostgreSQL `fitness` занимала примерно 21 MB.
PostgreSQL доступна на VPS только через `127.0.0.1:15432`, Redis и внутренние
API/ИИ/OCR не публикуются в интернет. Внешние домены обслуживает Caddy на 80/443.

Исходный код находится в `/opt/fitness/source`. База хранится в Docker volume,
а не внутри Git-репозитория. Production-ветка GitHub —
`timeweb-production-20260825` репозитория
<https://github.com/filya-fvo/fitness_prog>.

## 2. Как зайти на сервер

На своём Windows-компьютере откройте обычный **PowerShell** и выполните:

```powershell
ssh -i "$env:USERPROFILE\.ssh\fitness_timeweb" root@201.24.48.145
```

При первом подключении сверьте fingerprint SSH-сервера с данными сервера в
Timeweb/его консоли, затем подтвердите доверие. После входа строка
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

Пароль `root` для этого способа входа не нужен: проверенный ключ расположен в
`C:\Users\broadview\.ssh\fitness_timeweb`. Passphrase ключа, если она задана,
отличается от пароля `root`. Текущий пароль `root` и пароль аккаунта Timeweb
в рамках аудита не были доступны. Их нельзя восстановить из SSH-ключа или
хэша `/etc/shadow`; при необходимости задайте новый пароль средствами Timeweb
или восстановите доступ к самому аккаунту Timeweb. Работающий ключ сохраняйте.

### Пароль PostgreSQL для владельца

Пользователь и база: `fitness`. По запросу владельца пароль сохранён локально
как зашифрованный Windows DPAPI `PSCredential`, а не открытый текст:
`C:\fitness_prog\.env.vps-access.local`. Файл игнорируется Git. На том же
Windows-компьютере и под той же учётной записью владельца посмотреть пароль
можно самостоятельно:

```powershell
(Import-Clixml -LiteralPath C:\fitness_prog\.env.vps-access.local).GetNetworkCredential().Password
```

Команда выводит пароль на экран: выполняйте её только в личном окне PowerShell,
без записи экрана или transcript; результат не отправляйте в чат и не коммитьте.
DPAPI-файл не является переносимой резервной копией: другая Windows-учётная
запись обычно не сможет его расшифровать. Пароль `fitness` — пароль БД, он не
заменяет пароли SSH или Timeweb. После смены пароля БД локальная копия устареет.

## 3. Самая быстрая проверка состояния

На VPS выполните:

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production ps -a
```

Нормальное состояние:

- `api`, `db`, `redis`, `web`, `llm`, `ocr` — `Up` и `healthy` в проверенном срезе;
- `worker`, `caddy`, `telegram-poller` — `Up`; у сервисов без Docker healthcheck его отсутствие само по себе не является ошибкой;
- `migrate` может быть `Exited (0)` — это нормально: он выполняет миграции и завершает работу.

Затем проверьте публичные адреса:

```bash
curl --fail --silent https://api.filfitclub.ru/health
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' https://app.filfitclub.ru/
```

Ожидается `{"status":"ok"}` и код `200`.

Без SSH тот же срез доступен настроенному администратору в приложении:
**Профиль → Админ → Состояние системы**. Экран работает только на чтение и не
перезапускает сервисы. Ниже текущего среза находится история: worker сохраняет
безопасные статусы каждые 15 минут, ручная кнопка также создаёт снимок. В интерфейсе
видны примерно последние семь дней, в PostgreSQL записи хранятся 30 дней; полные
тексты диагностики, адреса и секреты в историю не записываются.
В пакете 0.21.44 исправлен обнаруженный 02.10.2026 дефект D21: API и worker
получают один каталог `/opt/fitness/status` в `/app/host-status` только для чтения
и переменную `ADMIN_SYSTEM_STATUS_DIR=/app/host-status`. Без этого ручная проверка
API видит backup/версию/HTTPS, а автоматическая история worker показывает «Нет данных».
После обновления Compose дождитесь следующего снимка (до 15 минут) и сравните
его с текущей проверкой в админке. Старые снимки не переписываются.
Подробности — в [отчёте исправлений](audits/2026-10-03-fixes.md).
Рядом находится **Журнал действий**: он показывает административные изменения,
их результат и correlation ID. Журнал также работает только на чтение; записи
защищены от `UPDATE` и `DELETE` на уровне PostgreSQL.
Чтобы карточка PostgreSQL оставалась доступна при полном отказе БД, у владельца
должен быть указан стабильный numeric ID в `ADMIN_TELEGRAM_IDS`: backend сверяет
его только с подписанным JWT. Username-доступ без живой БД намеренно не используется.

## 4. Как смотреть логи

Последние 100 строк основных сервисов:

```bash
docker compose --env-file backend/.env.production logs --since=30m --tail=100 api worker telegram-poller caddy
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
docker compose --env-file backend/.env.production logs --tail=100 llm ocr telegram-poller
```

В отчёты и сообщения нельзя копировать токены, OTP-коды, пароли, полные HTTP-заголовки
и персональные данные пользователей.

## 5. Как зайти в PostgreSQL

### DBeaver через встроенный SSH-туннель

Создайте соединение PostgreSQL со следующими параметрами:

| Настройка | Значение |
|---|---|
| PostgreSQL Host / Port | `127.0.0.1` / `15432` — адрес на VPS |
| Database / Username | `fitness` / `fitness` |
| Password | локально просмотренный пароль БД из раздела 2 |
| SSH: Use SSH Tunnel | включено |
| SSH Host / Port / User | `201.24.48.145` / `22` / `root` |
| Authentication / Private key | Public Key / `C:\Users\broadview\.ssh\fitness_timeweb` |
| Key passphrase | только если задана для ключа |

Проверьте **Test tunnel configuration**, затем **Test Connection**. Отдельный
PostgreSQL SSL не требуется для этого маршрута: внешний канал шифруется SSH.
Не открывайте 5432/15432 в firewall и не меняйте Compose binding на `0.0.0.0`.
Роль `fitness` имеет права изменения данных: для повседневного просмотра
включайте read-only режим DBeaver. Дополнительные варианты и отдельная роль —
в [инструкции DBeaver](DBEAVER_VPS_CONNECTION.md); создание роли с правами записи
не является обязательным шагом подключения.

Альтернатива — собственный туннель из Windows PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\fitness_timeweb" -N -o ExitOnForwardFailure=yes `
  -L 127.0.0.1:15433:127.0.0.1:15432 root@201.24.48.145
```

Окно оставьте открытым. В этом варианте DBeaver подключается к **локальным**
`127.0.0.1:15433`, база/пользователь `fitness`, а встроенный SSH-туннель DBeaver
выключен. `Ctrl+C` закрывает только туннель.

### psql внутри контейнера

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
| `exercise_media_assets` | загруженные администраторами изображения упражнений; входят в PostgreSQL backup |
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

Журнал `admin_audit_log` просматривается в админке с фильтрами и может быть
выгружен в CSV/JSON. Сервер ограничивает одну выгрузку 1000 новейшими совпадениями
и записывает факт экспорта обратно в неизменяемый журнал; содержимое выгрузки в
событие аудита не копируется. Связанный поиск работает по пользователю, названию
или UUID объекта и коду запроса; ссылки из результата открывают точную карточку
пользователя, упражнения, программы или рассылки.

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

Ежедневная копия PostgreSQL запускается в **03:15 UTC (06:15 МСК)** с случайной
задержкой до 10 минут: обычно **06:15–06:25 МСК**. Live-конфигурация проверена
02.10.2026: `OnCalendar=*-*-* 03:15:00 UTC`, `RandomizedDelaySec=10m`,
`Persistent=true`. После простоя пропущенный запуск может выполниться при
включении сервера. Проверить реальное расписание:

```bash
systemctl is-active fitness-backup.timer
systemctl list-timers fitness-backup.timer
systemctl cat fitness-backup.timer
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

Проверка архива и реального восстановления, без замены production-БД:

```bash
cd /opt/fitness/source
DUMP=/opt/fitness/backups/daily/fitness-YYYYMMDDTHHMMSSZ.dump
sha256sum --check "$DUMP.sha256"
bash scripts/verify-postgres-backup.sh "$DUMP"
```

Подставьте точное существующее имя вместо `YYYYMMDDTHHMMSSZ`. Ожидаются `OK` от
checksum и `RESTORE_VERIFY_OK`, `audit_trigger=verified` от скрипта. Он запускает
временный PostgreSQL 18 без сети и опубликованных портов, восстанавливает dump,
дважды проверяет миграции и append-only audit trigger, затем удаляет только свои
временные контейнер и volume. Проверка требует свободного места и работающего
Docker. Аудит 02.10.2026 успешно восстановил свежий backup: 36 public-таблиц,
защита журнала подтверждена. Это проверка конкретного dump, а не гарантия любого
будущего backup.

Скачать копию с VPS на Windows, выполняя команду уже в локальном PowerShell:

```powershell
scp -i "$env:USERPROFILE\.ssh\fitness_timeweb" `
  root@201.24.48.145:/opt/fitness/backups/daily/ИМЯ_ФАЙЛА.dump `
  "$env:USERPROFILE\Downloads\"
scp -i "$env:USERPROFILE\.ssh\fitness_timeweb" `
  root@201.24.48.145:/opt/fitness/backups/daily/ИМЯ_ФАЙЛА.dump.sha256 `
  "$env:USERPROFILE\Downloads\"
```

На Windows сравните хэш скачанного файла с первым 64-значным полем `.sha256`
через `Get-FileHash -Algorithm SHA256`. Сохраните пару dump/checksum на другом
устройстве или в личном защищённом backup-хранилище. Полный dump содержит
персональные данные; не публикуйте его как обычный QA-артефакт.

Копии на том же VPS не защищают от потери всего диска. Хотя бы раз в неделю храните
свежий dump на другом устройстве. Восстановление production-базы заменяет данные;
не запускайте его без отдельной свежей копии и проверки SHA-256.

### Замена production-БД из проверенного backup

Это действие удаляет текущую базу `fitness`. Выполняйте его только при принятом
владельцем решении о восстановлении и согласованном окне обслуживания. Сначала
проверьте dump изолированным скриптом выше, сохраните свежий dump текущей БД на
другом устройстве и запишите ожидаемую SHA-256 из доверенной копии checksum.

```bash
cd /opt/fitness/source
DUMP=/opt/fitness/backups/daily/fitness-YYYYMMDDTHHMMSSZ.dump
EXPECTED_SHA256='ВСТАВЬТЕ_64_СИМВОЛА_ИЗ_ПРОВЕРЕННОЙ_КОПИИ_SHA256'
docker compose --env-file backend/.env.production stop worker telegram-poller
bash scripts/replace-timeweb-postgres.sh /opt/fitness/source "$DUMP" "$EXPECTED_SHA256"
docker compose --env-file backend/.env.production up -d
sh scripts/write-admin-system-status.sh
docker compose --env-file backend/.env.production ps -a
curl --fail --silent https://api.filfitclub.ru/health
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' https://app.filfitclub.ru/
```

Ожидаемая SHA-256 — обязательные 64 шестнадцатеричных символа: заглушку запускать
нельзя. `replace-timeweb-postgres.sh` проверяет SHA до изменения БД, сам создаёт
дополнительный backup, останавливает API/web/Caddy/worker, пересоздаёт только
базу `fitness`, вызывает `restore-timeweb-postgres.sh` и миграции. Poller надо
остановить явно, как в примере: старый скрипт сам его не останавливает. При
любой ошибке оставьте worker/poller остановленными до разбора проблемы;
последующие команды не выполняйте автоматически. Прямой `pg_restore` в
работающую production-БД не заменяет эту процедуру. После успешного запуска
сверьте количество таблиц, основные записи, вход и историю тренировок.

## 9. Как обновляется приложение

Правильный путь всегда такой:

```text
изменение → тесты → commit → GitHub → backup VPS → pull → build → migrations → health-check
```

После того как проверенный commit уже отправлен в ветку
`timeweb-production-20260825`, на VPS сначала выполните:

```bash
cd /opt/fitness/source
git branch --show-current
git status --short
git rev-parse HEAD
```

Ветка должна быть `timeweb-production-20260825`, status — пустым. Запишите
предыдущий commit для возможного отката. Проверенный код публикуется из
локального рабочего каталога командами `git commit` и
`git push origin timeweb-production-20260825`; сам по себе локальный commit
ничего не меняет на VPS. После зелёных проверок и push:

```bash
cd /opt/fitness/source
BACKUP_DIR=/opt/fitness/backups sh scripts/backup_vps.sh
git status --short
git pull --ff-only origin timeweb-production-20260825
docker compose --env-file backend/.env.production config --quiet
docker compose --env-file backend/.env.production build --pull api worker telegram-poller ocr web
docker compose --env-file backend/.env.production run --rm migrate
docker compose --env-file backend/.env.production up -d
sh scripts/write-admin-system-status.sh
docker compose --env-file backend/.env.production ps -a
curl --fail --silent https://api.filfitclub.ru/health
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' https://app.filfitclub.ru/
```

`git status --short` перед обновлением должен быть пустым. Если там появились файлы,
не удаляйте и не перезаписывайте их вслепую — сначала выясните происхождение.

`write-admin-system-status.sh` записывает текущий commit, версию, время deploy и,
если сертификат доступен, срок его действия в `/opt/fitness/status`. API видит этот
каталог через read-only mount; скрипт не читает и не печатает секреты из env.

Production-конфигурация приложения с секретами находится в
`backend/.env.production`. Этот файл не коммитится и не должен заменяться
примером `.env.production.example`; SSH-ключи и локальный DPAPI-файл пароля
также остаются вне Git.

Порядок основан на [фактическом runbook Timeweb](TIMEWEB_DOMAIN_CUTOVER.md#обновление-приложения),
с отдельным явным запуском `migrate`. `scripts/apply_migrations_vps.sh` применяет
SQL по порядку имён, каждый файл в отдельной транзакции, и ведёт
`fitness_schema_migrations`; уже отмеченные миграции пропускаются. Ожидаемый
итог — `MIGRATIONS_OK`. Старые SQL не переписываются. Seed/reset/rebuild каталога
не являются обычными шагами обновления.

Проверить журнал миграций можно без изменений:

```bash
docker compose --env-file backend/.env.production exec -T db psql -U fitness -d fitness \
  -c 'SELECT filename, applied_at FROM fitness_schema_migrations ORDER BY filename DESC LIMIT 10;'
```

После выпуска проверьте browser/Telegram-вход, одну существующую тренировку,
каталог, worker/poller и свежий backup. Если сборка упала, не запускайте
обновлённые контейнеры; если миграция упала, не продолжайте `up -d` до выяснения
причины. Backend собирается из корня: инструкции должны попасть в `/docs`
внутри API-образа. `frontend_releases` сохраняет старые chunks для открытых
Telegram/PWA клиентов, его нельзя очищать при выпуске.

### Откат кода и данных

Откат кода выполняйте проверенным `git revert` в чистом локальном каталоге на
production-ветке: это создаёт новый commit и сохраняет историю и ту же ветку
на VPS. Для одного обычного ошибочного commit, после проверки изменений:

```powershell
git switch timeweb-production-20260825
git status --short
git revert SHA_ОШИБОЧНОГО_COMMIT
```

После этого пройдите тесты, отправьте новый commit в GitHub и примените обычную
процедуру обновления выше. Для нескольких commits или merge сначала подготовьте
отдельный план revert; не подставляйте диапазон вслепую. Не переключайте
production в detached HEAD и не выполняйте `git reset --hard` на VPS.

Откат приложения не отменяет SQL-миграции. Если старая версия несовместима с
новой схемой, предпочтителен исправляющий выпуск; автоматического rollback SQL
нет. Восстановление данных из dump — отдельное решение по разделу 8: оно
возвращает состояние на время backup и теряет последующие изменения. Перед
ним обязательно сохраните текущую БД и согласуйте допустимую потерю данных.

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

`restart` перезапускает существующие контейнеры, но не подхватывает новую сборку
или изменения env/Compose. Для применения этих изменений используйте процедуру
обновления и `up -d`. Если весь стек ранее был остановлен, его запускает
`docker compose --env-file backend/.env.production up -d`, а не `restart`.

Не используйте `docker compose down -v`: ключ `-v` удаляет volumes, включая базу данных.

## 11. Диск, память и нагрузка

Свободное место на диске:

```bash
df -h
du -sh /opt/fitness/backups/*
docker system df
journalctl --disk-usage
docker system df -v
```

Если строка `Build Cache` заняла несколько гигабайт, после успешной проверки
текущего релиза можно удалить только неиспользуемый кэш сборок старше 72 часов:

```bash
docker builder prune --all --force --filter until=72h
```

В аудите 02.10.2026 так удалено **4,526 GB** неиспользуемого builder cache;
занятость системного диска уменьшилась с **56% до 48%**. Работающие контейнеры,
образы runtime, volumes, backups и модель остались на месте. Кэш повторно
растёт при сборках. Это результат конкретной очистки, не текущая постоянная
занятость диска.

| Что занимает место | Как поступать |
|---|---|
| Docker build cache | После успешного выпуска допустима команда выше; следующий build может идти дольше. |
| PostgreSQL `pgdata`, Redis `redisdata` | Рабочие данные. Не удалять и не очищать Docker volume. |
| `/opt/fitness/models` | Рабочий GGUF модели, сохранён. |
| `/opt/fitness/backups` | Backup. Сначала проверить восстановление и внешнюю копию; возраст сам по себе не доказывает ненужность. |
| `frontend_releases`, Caddy data/config | Рабочие старые chunks и HTTPS-состояние. Сохранить. |
| Docker images | Работающие и предыдущие версии могут быть нужны для эксплуатации; не запускать общий prune. |
| systemd journal | Конфигурация `deploy/journald-fitness.conf` предусматривает до 1 GiB постоянных журналов, резерв свободного места 2 GiB, максимальный возраст 30 дней. Лимит размера может сократить этот период; перед применением сохранить прежнюю диагностику. |

Compose ограничивает stdout/stderr каждого контейнера: `json-file`, пять файлов
по 20 MiB. Новый предел применяется при пересоздании контейнера через `up -d`,
а не через `restart`. Отдельные файлы приложения в `backend_logs` сохраняют
собственную ротацию. При интенсивной записи срок доступной истории зависит от
объёма, а не только от календарной даты.

Конфигурация journald хранится в Git. На новом VPS сначала сохраните существующие
журналы и проверьте копию вне сервера: применение меньшего лимита может сразу
удалить старые закрытые файлы. Затем из `/opt/fitness/source`:

```bash
install -D -m 0644 deploy/journald-fitness.conf /etc/systemd/journald.conf.d/60-fitness-limits.conf
systemctl restart systemd-journald
systemctl is-active systemd-journald
journalctl --disk-usage
```

При исправлении 04.10.2026 закрытые journal-файлы и снимок syslog сохранены в
`/opt/fitness/backups/diagnostics/followup-20261004/host-logs-before-limits.tar.gz`.
Для локальной копии предусмотрен путь
`C:\fitness_prog\backups\audit-followup-20261004\host-logs-before-limits.tar.gz`;
передача полного архива выполняется с разрешения владельца, после неё нужно
сверить SHA-256. Это архив диагностики, отдельно от PostgreSQL backup.

Если журналы снова быстро растут, сначала найдите источник. В этом случае им был
осиротевший тестовый процесс с бесконечным ожиданием удалённой QA-сети; остановлен
только подтверждённый процесс. Ограничение размера не заменяет устранение причины.
Временные проверки на VPS запускайте с предельным временем и ограниченным числом
повторов, например `timeout --signal=TERM --kill-after=10s 10m bash <script>`.
Не завершайте процессы по общему слову `docker`, `python` или `bash`.

Для поиска крупного каталога, без чтения содержимого файлов:

```bash
du -xhd1 /opt/fitness /var/lib/docker /var/log 2>/dev/null
```

Каталог `/opt/fitness/models` содержит рабочую локальную ИИ-модель
`qwen3-1.7b-q4_k_m.gguf`. Его нельзя включать в общую очистку.
При замене модели старые 3B/1.5B GGUF сохраняют до успешной проверки новой модели
в приложении; затем удаляют только два точных старых файла по
[runbook ИИ](ADMIN_AI_MODEL_RUNBOOK.md#откат-без-потери-данных).
После удаления откат требует повторной загрузки прежних весов с проверкой SHA-256.
Перед удалением других крупных файлов сначала проверьте
mounts контейнеров, открытые файлы и ссылки из Compose/systemd/cron.

Память и текущая нагрузка:

```bash
free -h
uptime
docker stats --no-stream
```

Не запускайте `docker system prune --volumes`: эта команда может удалить данные.
Старые образы и backup удаляйте только после проверки точных путей и наличия другой копии.

## 12. HTTPS, домен и Telegram

Для входа через Telegram в обычном браузере откройте **@BotFather → бот → Login
Widget** и добавьте Allowed URL `https://app.filfitclub.ru`. Алгоритм подписи
оставьте `RS256`. Backend получает публичные ключи только с
`https://oauth.telegram.org/.well-known/jwks.json`, проверяет issuer, audience и
короткоживущий nonce; номер телефона и право писать пользователю не запрашиваются.
`TELEGRAM_LOGIN_CLIENT_ID` обычно оставляют пустым — numeric bot id безопасно
извлекается из префикса `BOT_TOKEN`.

DNS управляется в Timeweb. Cloudflare в production не используется. Записи:

- `app.filfitclub.ru` → `201.24.48.145`;
- `api.filfitclub.ru` → `201.24.48.145`.

Caddy автоматически получает и продлевает сертификаты Let's Encrypt. Проверить его логи:

```bash
docker compose --env-file backend/.env.production logs --tail=100 caddy
```

В production события Telegram принимает исходящий long polling. Поэтому
`getWebhookInfo` должен показывать пустой `url`, а контейнер `telegram-poller` —
регулярный heartbeat. Обработчик остаётся закрытым секретом, но poller обращается
к нему только по внутреннему Docker-адресу:

```text
http://api:8000/telegram/webhook
```

Команда `getChatMenuButton` должна возвращать тип `web_app` с текстом **Открыть**.
Это настраивает `telegram-poller` при запуске. Команды `/start` и `/help` также
доступны под полем ввода; ответ `/start` содержит кнопку открытия по адресу:

```text
https://app.filfitclub.ru/
```

После изменения адресов используйте `scripts/setup_telegram_bot.ps1` с локального
Windows-компьютера. Не вставляйте BOT_TOKEN в командную строку или переписку.

### Telegram IPv6 и локальный ИИ/OCR

API, worker и poller имеют отдельную сеть `ipv6_egress`: в текущей сети Timeweb
Telegram Bot API недоступен по IPv4, исходящий канал работает через IPv6.
При сбое проверяйте маршрут и сохранённые параметры, без изменения токенов:

```bash
ip -6 route show default
networkctl status eth0 --no-pager
sysctl net.ipv6.conf.all.forwarding net.ipv6.conf.eth0.accept_ra
docker compose --env-file backend/.env.production exec -T api \
  curl -6 -fsS --connect-timeout 5 --max-time 15 -o /dev/null -w '%{http_code}\n' https://api.telegram.org/
```

В сохранённой политике `deploy/timeweb/99-fitness-docker-ipv6.conf` и
`/etc/sysctl.d/99-fitness-docker-ipv6.conf` указаны `forwarding=1`,
`eth0.accept_ra=2`. Однако runtime-срез 02.10.2026 показывал `accept_ra=0`,
при этом интерфейс был `routable/configured`, default IPv6 route — `proto ra`,
а запрос Telegram из API возвращал `302`, то есть соединение работало.
`systemd-networkd` обслуживал `eth0` через
`/run/systemd/network/10-netplan-eth0.network` (`DHCP=yes`). Networkd принимает
Router Advertisement своей реализацией и отключает kernel RA, поэтому одно
значение sysctl `0` не доказывает отказ сети. Это объяснено в
[официальной документации systemd.network](https://github.com/systemd/systemd/blob/main/man/systemd.network.xml).
Проверяйте вместе маршрут, `networkctl` и реальный запрос; сохранённую политику
не меняйте ради совпадения одной цифры и не перезапускайте сеть вслепую.
Не возвращайте
публичный Telegram webhook для обхода этой диагностики: он был отключён из-за
подтверждённых входящих timeout.

Текстовые запросы обрабатывает локальный Qwen3-1.7B через `llm:8080/v1`
с alias `qwen3-1.7b`, без thinking и `mmproj`. Этикетки обрабатывает
PP-OCRv5 через `ocr:8090` и детерминированный парсер: фото и OCR-текст в LLM
не отправляются. Сервисы доступны только внутри Docker; отправка
данных внешним AI API и внешний fallback в production отсутствуют. Проверки:

```bash
docker compose --env-file backend/.env.production ps llm ocr
docker compose --env-file backend/.env.production logs --tail=100 llm ocr
docker compose --env-file backend/.env.production exec -T api \
  curl -fsS --max-time 15 http://llm:8080/health
docker compose --env-file backend/.env.production exec -T api \
  curl -fsS --max-time 10 http://ocr:8090/health
```

Ответ OCR ожидается `{"status":"ok"}`. При недоступной модели API может дать
безопасный ответ по правилам, поэтому успешный общий `/health` не доказывает
работу ИИ. Подробности — [руководство Qwen/OCR](ADMIN_AI_MODEL_RUNBOOK.md).

## 13. Частые проблемы

Если приложение недоступно, сначала определите слой сбоя:

1. Проверьте сайт и `/health` с Windows; если оба недоступны, проверьте SSH,
   DNS и Caddy. Если `/health` отвечает, начните с `web` и frontend.
2. На VPS проверьте `ps -a`, последние 100 строк затронутого сервиса, `df -h`
   и `free -h`. Не очищайте БД или очередь ради освобождения места.
3. Проверьте PostgreSQL и Redis командами ниже. Для Telegram — poller/IPv6,
   для этикетки/ИИ — OCR/LLM, для входа по email — API/SMTP.
4. Запишите время сбоя, commit, сервис и безопасный текст ошибки. Сохраните
   диагностику до перезапуска.
5. Исправляйте или перезапускайте конкретный сервис; после действия повторите
   публичные проверки. При изменении данных сначала создайте backup.

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production exec -T db pg_isready -U fitness -d fitness
docker compose --env-file backend/.env.production exec -T redis redis-cli ping
ss -lnt '( sport = :15432 )'
```

Ожидаются PostgreSQL accepting connections, Redis `PONG` и только loopback
`127.0.0.1:15432`. При проблеме DBeaver сначала проверьте обычный SSH-вход;
затем loopback-порт, параметры туннеля и пароль БД. При проблеме backup
проверьте `fitness-backup.service`, свободное место и состояние `db`.

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
3. Проверьте `docker compose ... ps telegram-poller` и его последние логи.
4. Проверьте, что `getWebhookInfo` показывает пустой webhook URL и очередь не растёт.
5. Не запускайте одновременно локальный и VPS poller/worker.

Не очищайте очередь при обычном сбое: poller заберёт её после восстановления.
Очистка допустима только если владелец явно решил удалить заведомо устаревшие
updates; штатный запуск всегда использует `drop_pending_updates=false`.

```bash
docker compose --env-file backend/.env.production restart telegram-poller
```

### Не приходят уведомления

```bash
docker compose --env-file backend/.env.production ps worker telegram-poller redis
docker compose --env-file backend/.env.production logs --tail=100 worker telegram-poller
docker compose --env-file backend/.env.production exec -T redis redis-cli ping
```

Ожидается `PONG`. В строках `scheduled_dispatch` поле `errors` должно быть `0`.

Если из карточки пользователя не отправляется инструкция, проверьте, что оба
канонических документа вошли в текущий API-образ:

```bash
docker compose --env-file backend/.env.production exec -T api test -s /docs/USER_GUIDE.md
docker compose --env-file backend/.env.production exec -T api test -s /docs/ADMIN_GUIDE.md
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
2. Отправить боту `/start`, проверить кнопки `/start`, `/help` и **Открыть приложение**.
3. Проверить `docker compose ... ps`.
4. Проверить `/health` и логи worker на `errors: 0`.
5. Проверить последний ежедневный backup.
6. Скачать свежий dump на другое устройство.
7. Проверить свободное место командой `df -h`.

Раз в месяц дополнительно:

1. Изолированно восстановить последний dump через `verify-postgres-backup.sh`
   и проверить SHA-256 внешней копии.
2. Проверить расписание backup, HTTPS-сертификаты, место, память, Docker cache
   и накопление журналов. Сначала измерить, затем решать вопрос очистки.
3. Сверить ветку/commit VPS с последним согласованным выпуском и проверить
   отсутствие локальных изменений. Проверить актуальность доступа SSH и
   локально сохранённого пароля БД после возможной смены.
4. Проверить browser/Telegram-вход, `/start`, `/help`, уведомления на своём
   аккаунте, фото этикетки и короткий запрос ИИ. Внешние сообщения запускать
   осознанно только на выделенный тестовый аккаунт.
5. Сверить доступные обновления ОС/зависимостей с процессом тестов и выпуска;
   не выполнять обновление схемы или массовый seed в рамках уборки диска.

## 16. Откуда взяты команды

Рабочий источник — `docker-compose.yml`, `scripts/backup_vps.sh`,
`install-vps-backup-timer.sh`, `verify-postgres-backup.sh`,
`apply_migrations_vps.sh`, `replace-timeweb-postgres.sh`,
`restore-timeweb-postgres.sh` и фактические проверки VPS 02.10.2026. Срезы
серверного состояния не заменяют повторную проверку перед изменением данных.

- [Первоначальная установка VPS](VPS_DEPLOYMENT_GUIDE.md).
- [Timeweb: схема переключения и обновление](TIMEWEB_DOMAIN_CUTOVER.md).
- [Встроенная админка](ADMIN_GUIDE.md).
- [DBeaver и SSH-туннель](DBEAVER_VPS_CONNECTION.md).
- [Qwen/OCR](ADMIN_AI_MODEL_RUNBOOK.md).
- [Локальные файлы и очистка 02.10.2026](audits/2026-10-02-local-storage.md).
- [Общий аудит 02.10.2026](audits/2026-10-02-full-audit.md).

Если действие может удалить или заменить данные, сначала остановитесь, создайте backup
и отдельно подтвердите точную команду и её цель.
