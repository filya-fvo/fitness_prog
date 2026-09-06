# Timeweb VPS: перенос без Cloudflare и без потери данных

Эта инструкция описывает фактическую production-схему проекта на 25 августа
2026 года. Локальный Windows-сервер с Supervisor и Tailscale остаётся включённым
до финальной проверки Timeweb.

## Текущая схема

```text
Telegram / браузер
        ├── https://app.filfitclub.ru → Caddy → Nginx → React
        └── https://api.filfitclub.ru → Caddy → FastAPI
                                              ├── PostgreSQL 18 + pgvector
                                              └── Redis 7.4 → ARQ worker
```

Все компоненты находятся на одном VPS `fitness-prod-vps` в закрытой Docker-сети.
Наружу открыты только SSH, HTTP и HTTPS. PostgreSQL, Redis, API и Nginx не
публикуют свои порты напрямую. Cloudflare в схеме нет.

## Что уже сделано

- VPS Timeweb: Ubuntu 24.04, 2 CPU, 4 ГБ RAM, 50 ГБ NVMe;
- публичный IPv4: `201.24.48.145`;
- установлены Docker и Compose, UFW, fail2ban, автообновления и swap 2 ГБ;
- подключено официальное зеркало Docker Hub от Timeweb;
- код находится в `/opt/fitness/source`, production-ветка —
  `timeweb-production-20260825`;
- PostgreSQL и Redis работают только во внутренней Docker-сети;
- дамп локальной PostgreSQL проверен по SHA-256 и восстановлен;
- все 14 таблиц и количество строк сверены с локальной базой;
- миграции завершились сообщением `MIGRATIONS_OK`;
- API и frontend внутри VPS проходят healthcheck;
- VPS-worker остановлен до финального переключения, чтобы не дублировать
  уведомления локального worker.

Управляемый кластер PostgreSQL `fitness-prog` пока не удалять. Он не участвует в
работе VPS, но удалять его следует только после полной проверки и подтверждения
владельца.

## Правила безопасного переключения

1. Не выключать локальный Supervisor и Tailscale до финального шага.
2. Не запускать одновременно локальный и VPS-worker: они отправят дубли.
3. Не менять Telegram Menu Button и webhook до рабочего HTTPS на обоих доменах.
4. Не удалять локальную PostgreSQL и дампы после переключения.
5. Перед финальным переключением сделать свежий дамп: текущая VPS-база — снимок,
   а локальное приложение продолжает принимать изменения.
6. Никогда не выполнять `docker compose down -v`: ключ `-v` удаляет данные.

## Шаг 1. Подготовить DNS-зону Timeweb

Откройте **Домены и SSL** → `filfitclub.ru` → **DNS**. До смены NS проверьте или
создайте записи:

| Тип | Хост | Значение | Приоритет |
|---|---|---|---|
| A | `app` | `201.24.48.145` | — |
| A | `api` | `201.24.48.145` | — |
| MX | `@` | `mx1.timeweb.ru` | 10 |
| MX | `@` | `mx2.timeweb.ru` | 20 |
| TXT | `@` | `v=spf1 include:_spf.timeweb.ru ~all` | — |

Старые CNAME на `cfargotunnel.com` и другие Cloudflare-записи не переносить.
AAAA для `app` и `api` пока не добавлять. TTL оставить стандартным.

Затем на вкладке **Управление** нажмите **Установить NS-серверы Timeweb**. Должны
быть указаны:

```text
ns1.timeweb.ru
ns2.timeweb.ru
ns3.timeweb.org
ns4.timeweb.org
```

Делегирование обычно занимает от 3 до 24 часов. Проверка из PowerShell:

```powershell
Resolve-DnsName filfitclub.ru -Type NS
Resolve-DnsName app.filfitclub.ru -Type A
Resolve-DnsName api.filfitclub.ru -Type A
Resolve-DnsName filfitclub.ru -Type MX
```

Продолжать можно, когда NS показывают только Timeweb, а оба A-домена —
`201.24.48.145`.

Официальная инструкция: [DNS и NS Timeweb](https://timeweb.cloud/docs/domains/dns-records-management).

## Шаг 2. Включить HTTPS без worker

На VPS:

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production up -d db redis api web caddy
docker compose --env-file backend/.env.production ps
```

Caddy автоматически получит сертификаты после обновления DNS. Проверка с
Windows:

```powershell
curl.exe --fail https://api.filfitclub.ru/health
curl.exe -sS --max-time 20 -o NUL -w "status=%{http_code}`n" https://app.filfitclub.ru/
```

Ожидаются `{"status":"ok"}` и `status=200`. Worker на этом шаге должен
оставаться остановленным.

## Шаг 3. Проверить интерфейс до переключения Telegram

Откройте `https://app.filfitclub.ru` в обычном браузере и войдите по email OTP.
Проверьте чтение данных:

- профиль и программа;
- история тренировок;
- питание и дневные показатели;
- каталог упражнений и изображения;
- страница подготовки следующей тренировки.

Не создавайте тренировку или запись питания: перед финальным переносом эта
тестовая база всё равно будет заменена свежим снимком локальной PostgreSQL.

## Шаг 4. Финальная синхронизация данных

Этот шаг выполняется вместе с владельцем в короткое окно обслуживания.

1. Дважды кликнуть `pause-local-for-vps-cutover.cmd`. Скрипт с правами
   администратора остановит только локальные Supervisor, API и worker. Tailscale,
   PostgreSQL, Redis, файлы и данные останутся на месте. Для отката предусмотрен
   `resume-local-after-vps-cutover.cmd`.
2. Создать новый дамп скриптом `export-local-postgres-for-timeweb.ps1`.
3. Сделать резервную копию VPS-базы командой:

```bash
cd /opt/fitness/source
BACKUP_DIR=/opt/fitness/backups sh scripts/backup_vps.sh
```

4. Остановить VPS API/web, пересоздать только базу `fitness` и восстановить новый
   дамп через `replace-timeweb-postgres.sh`. Скрипт требует ожидаемую SHA-256 и
   перед заменой сам делает дополнительный backup VPS. Это намеренно заменяет
   предварительный снимок и требует отдельного подтверждения владельца
   непосредственно перед выполнением.
5. Повторно сверить количества строк и выполнить миграции.
6. Запустить `api`, `web`, `caddy` и один VPS-worker.

До этого шага VPS-worker не включать.

## Шаг 5. Переключить Telegram

Только после зелёных HTTPS-проверок и финальной синхронизации:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\setup_telegram_bot.ps1 `
  -MiniAppUrl "https://app.filfitclub.ru" `
  -SkipWebhook `
  -SkipMenu `
  -SkipPersistMiniAppUrl
```

Флаги сохраняют ручную настройку `web_app` в BotFather и локальный rollback-env;
production Compose сам отключает webhook без удаления ожидающих updates и запускает
`telegram-poller`. Это обходит нестабильный входящий маршрут Telegram → Timeweb.
Проверить:

1. `/start` открывает `https://app.filfitclub.ru`;
2. авторизация Telegram проходит;
3. главная, история и подготовка тренировки показывают перенесённые данные;
4. тестовое уведомление приходит один раз;
5. `api`, `worker` и `telegram-poller` имеют статус `Up`.

Если в BotFather вручную настроен постоянный `web_app`/Menu Button, сама настройка остаётся ручной.
В BotFather нужно изменить только её URL на `https://app.filfitclub.ru`, не удаляя саму кнопку.
`Повторный /start` обновляет inline-кнопку в новом сообщении, но не переписывает ручную BotFather-кнопку.
Для безопасной смены только URL без удаления `web_app` можно выполнить:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\setup_telegram_bot.ps1 `
  -MiniAppUrl "https://app.filfitclub.ru" `
  -SkipWebhook `
  -UpdateWebAppMenu `
  -SkipPersistMiniAppUrl
```

После успешного переключения один раз отправить всем привязанным Telegram-пользователям
новый адрес и просьбу повторить `/start`. Ручной `web_app`/Menu Button не меняется:

Когда VPS стабильно работает и локальный откат больше не должен запускаться после
перезагрузки Windows, выполните `disable-local-fitness-runtime.cmd`. В отличие от
временной паузы, команда удаляет fitness-задачи автозапуска, выключает старый Funnel
и переводит локальный PostgreSQL в ручной запуск, не удаляя его данные.

```bash
docker compose --env-file backend/.env.production run --rm api \
  python scripts/sync_telegram_entrypoints.py \
  --announce-vps-cutover \
  --preserve-menu-button
```

Повторно команду без необходимости не запускать: это массовая рассылка.

Ежедневный backup PostgreSQL в 03:15 UTC включается один раз:

```bash
sh scripts/install-vps-backup-timer.sh
```

Копии лежат в `/opt/fitness/backups/daily`. Они защищают от ошибки в БД, но не от потери
всего VPS-диска; поэтому хотя бы раз в неделю скачивайте свежий `.dump` на другое устройство.

## Шаг 6. Наблюдение и отключение локального контура

Минимум 24 часа сохранять локальную PostgreSQL, Supervisor, Tailscale и исходный
дамп как резерв. Локальный worker после переключения должен оставаться
остановленным, иначе появятся дубли уведомлений.

После суток стабильной работы:

- повторно проверить Telegram и browser OTP;
- проверить автоматический backup VPS;
- отключить Windows-службу `cloudflared`, если она ещё установлена;
- только с отдельного подтверждения удалить неиспользуемую управляемую БД
  `fitness-prog`, чтобы прекратить её оплату;
- локальные PostgreSQL и дампы не удалять.

## Обновление приложения

```bash
cd /opt/fitness/source
BACKUP_DIR=/opt/fitness/backups sh scripts/backup_vps.sh
git pull --ff-only
docker compose --env-file backend/.env.production build --pull api worker telegram-poller web
docker compose --env-file backend/.env.production up -d
sh scripts/write-admin-system-status.sh
docker compose --env-file backend/.env.production ps
```

API, worker и telegram-poller подключены к отдельной dual-stack сети `ipv6_egress`: Telegram Bot
API в текущей сети Timeweb недоступен по IPv4, но доступен по IPv6. На VPS должен
быть установлен версионированный sysctl-файл и применены его параметры:

```bash
install -m 0644 deploy/timeweb/99-fitness-docker-ipv6.conf \
  /etc/sysctl.d/99-fitness-docker-ipv6.conf
sysctl --system
sysctl net.ipv6.conf.all.forwarding net.ipv6.conf.eth0.accept_ra
```

Ожидаются значения `1` и `2`. `accept_ra=2` обязателен: Timeweb выдаёт default
IPv6 route через Router Advertisement, и без него маршрут исчезнет после
включения forwarding. После первого добавления сети проверить исходящий канал:

```bash
docker compose --env-file backend/.env.production exec -T api \
  curl -6 -fsS --connect-timeout 5 https://api.telegram.org/ >/dev/null
```

Если Docker Hub возвращает `429 Too Many Requests`, проверить зеркало:

```bash
docker info --format '{{json .RegistryConfig.Mirrors}}'
```

Ожидается `https://dockerhub.timeweb.cloud/`.

## Быстрая диагностика

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production ps
docker compose --env-file backend/.env.production logs --tail=100 api worker telegram-poller caddy
docker compose --env-file backend/.env.production exec -T db pg_isready -U fitness -d fitness
docker compose --env-file backend/.env.production exec -T redis redis-cli ping
```

Логи не должны содержать токены, OTP и пароли. Telegram-токен в HTTP-логах
редактируется как `[REDACTED]`.
