# Развёртывание Fitness Mini App на VPS

Актуальность цен и команд: **23 августа 2026 года**. Эта инструкция рассчитана
на Ubuntu 24.04 LTS, Docker Compose и два постоянных HTTPS-имени:

- `app.filfitclub.ru` — React/PWA;
- `api.filfitclub.ru` — FastAPI и Telegram webhook.

Точный cutover для панели Timeweb, хранение API-токена и действия в GitHub:
[`TIMEWEB_DOMAIN_CUTOVER.md`](TIMEWEB_DOMAIN_CUTOVER.md). API-токен Timeweb
обычному deployment не требуется; сервер забирает код по read-only deploy key.
Не используйте IP-адрес или временный URL в `MINI_APP_URL`: Telegram, CORS, PWA
и Web Push привязаны к HTTPS-origin.

## 1. Какой VPS купить

Минимум для этого проекта — **2 vCPU, 4 ГБ RAM, 40 ГБ NVMe и публичный IPv4**.
Runtime поместится и в 2 ГБ, но одновременная сборка Node/Vite, PostgreSQL,
FastAPI, ARQ worker, Redis, Nginx и Caddy может исчерпать память. На 4 ГБ с
добавленным swap остаётся безопасный запас без перехода на дорогой тариф.

Это обоснованный стартовый размер для текущего монолитного приложения, а не
обещание производительности при неизвестном числе одновременных пользователей.
После запуска включите мониторинг провайдера: если CPU устойчиво выше 70%,
доступной RAM остаётся менее 500 МБ или начинается постоянная работа со swap,
увеличьте VPS до 4 vCPU / 8 ГБ без изменения архитектуры.

Сравнение по официальным страницам провайдеров:

| Провайдер | Конфигурация | Цена на дату проверки | Комментарий |
|---|---:|---:|---|
| Beget, Санкт-Петербург | 2 vCPU, 4 ГБ, 40 ГБ NVMe, 1 Гбит/с | 33 ₽/день + IPv4 5 ₽/день, то есть 1 140 ₽ за 30 дней | Рекомендация: российский провайдер, оплата в рублях, бесплатные автоматические backup VPS раз в несколько дней |
| Timeweb Cloud, MSK 50 | 2 vCPU, 4 ГБ, 50 ГБ NVMe, 1 Гбит/с | 1 080 ₽/месяц + платный IPv4 | Хорошая альтернатива; итоговую цену IPv4 проверить в корзине |

Основной выбор: **Beget 2 vCPU / 4 ГБ / 40 ГБ с публичным IPv4**. Выберите
Ubuntu 24.04 без платной панели управления. Цена посуточная, поэтому в 31-дневном
месяце Beget спишет 1 178 ₽. Домен оплачивается отдельно.

Не берите ARM-сервер: используемые образы имеют ARM-варианты, но x86_64 проще
диагностировать и полностью совпадает с CI. Если база и резервные копии вырастут
примерно до 20 ГБ, увеличьте диск до того, как останется менее 25% свободного
места.

Официальные страницы: [Beget VPS](https://beget.com/ru/vps),
[Timeweb Cloud](https://timeweb.cloud/services/cloud-servers).

## 2. Что будет работать на сервере

`docker-compose.yml` поднимает закрытую внутреннюю сеть:

```text
Internet :80/:443
        ↓
      Caddy  ── app.filfitclub.ru ── Nginx/React
        └──── api.filfitclub.ru ──── FastAPI
                                      ├── PostgreSQL 18 + pgvector
                                      └── Redis 7.4 ← ARQ worker
```

Наружу опубликованы только 80/443. PostgreSQL, Redis, API и Nginx не имеют
host-портов. Caddy получает и продлевает TLS-сертификаты автоматически. Миграции
запускаются до API и worker; неуспешная миграция не пропускается.

PostgreSQL хранит пользователей, тренировки, питание, настройки и подписки.
Redis содержит временную очередь, блокировки и таймеры. Поэтому переносится
PostgreSQL, но **не** `tools/redis/dump.rdb`. На VPS Redis использует AOF.
Отдельный `backend_data` volume сохраняет небольшой служебный маркер уже
отправленного Telegram `/start`-руководства между заменами API-контейнера.

Для PostgreSQL 18 именованный volume намеренно смонтирован в
`/var/lib/postgresql`, а не в исторический `/var/lib/postgresql/data`: начиная с
18 официальный image хранит кластер в `/var/lib/postgresql/18/docker`. Не меняйте
этот target при обновлении Compose. Изменение описано в
[документации official PostgreSQL image](https://hub.docker.com/_/postgres#pgdata).

## 3. До покупки: подготовить домен и SSH-ключ

Нужен домен, DNS которого вы можете редактировать. Подойдут, например,
`app.ваш-домен.ru` и `api.ваш-домен.ru`.

Создайте отдельный SSH-ключ администратора на своём Windows-компьютере:

```powershell
ssh-keygen -t ed25519 -a 64 -f $env:USERPROFILE\.ssh\fitness_vps -C "fitness-vps-admin"
Get-Content $env:USERPROFILE\.ssh\fitness_vps.pub
```

Задайте ключу парольную фразу. Публичную строку `.pub` добавьте в панели
провайдера при создании VPS. Приватный файл `fitness_vps` никому не отправляйте.

После покупки сохраните IPv4 как `VPS_IP` у себя в заметках. Первое подключение:

```powershell
ssh -i $env:USERPROFILE\.ssh\fitness_vps root@VPS_IP
```

## 4. Базовая защита Ubuntu

В первой SSH-сессии под `root` выполните:

```bash
apt update
apt full-upgrade -y
apt install -y ca-certificates curl git ufw fail2ban unattended-upgrades nano
timedatectl set-timezone UTC

adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
ufw status verbose
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

Не закрывайте эту root-сессию. Во втором окне PowerShell проверьте вход новым
пользователем:

```powershell
ssh -i $env:USERPROFILE\.ssh\fitness_vps deploy@VPS_IP
sudo -v
```

Только после успешного второго входа запретите парольный SSH-вход:

```bash
sudo nano /etc/ssh/sshd_config.d/99-fitness.conf
```

Содержимое:

```text
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
```

Проверьте конфигурацию до reload:

```bash
sudo sshd -t
sudo systemctl reload ssh
```

Снова проверьте новую SSH-сессию. Если провайдер не перенёс root-ключ в
`authorized_keys`, сначала добавьте содержимое `fitness_vps.pub` вручную и лишь
потом отключайте пароль.

## 5. Swap и ограничение Docker-логов

Даже при 4 ГБ RAM добавьте 2 ГБ swap для пиков сборки:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Создайте `/etc/docker/daemon.json` после установки Docker (следующий раздел),
чтобы контейнерные логи не заполнили диск:

```bash
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

## 6. Установка Docker из официального репозитория

Не используйте устаревший пакет `docker.io` из Ubuntu. Команды ниже следуют
[официальной инструкции Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/):

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
sudo systemctl enable --now docker
sudo systemctl restart docker
```

Выйдите из SSH и войдите снова, чтобы применить группу `docker`, затем проверьте:

```bash
docker version
docker compose version
docker run --rm hello-world
```

## 7. Авторизация VPS в GitHub

Репозиторий сейчас публичный, поэтому HTTPS clone возможен без токена. Для
явной авторизации и на случай перехода в private используйте **read-only deploy
key**. Не копируйте на сервер свой личный GitHub SSH-ключ и не создавайте PAT с
правом записи.

На VPS под `deploy`:

```bash
ssh-keygen -t ed25519 -a 64 -f ~/.ssh/fitness_github_deploy \
  -C "fitness-vps-readonly" -N ''
cat ~/.ssh/fitness_github_deploy.pub
```

В GitHub откройте репозиторий `filya-fvo/fitness_prog` → **Settings → Deploy
keys → Add deploy key**. Вставьте публичную строку, имя задайте
`fitness-production-vps`, флажок **Allow write access** не включайте.

Создайте на VPS `~/.ssh/config`:

```text
Host github-fitness
    HostName github.com
    User git
    IdentityFile ~/.ssh/fitness_github_deploy
    IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T git@github-fitness
```

При первом соединении сравните показанный fingerprint с актуальным fingerprint
в [документации GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints),
а не подтверждайте незнакомый ключ вслепую. Сообщение GitHub об отсутствии shell
access после успешной аутентификации — нормальное.

Клонирование:

```bash
sudo install -d -m 755 -o deploy -g deploy /opt/fitness
git clone git@github-fitness:filya-fvo/fitness_prog.git /opt/fitness
cd /opt/fitness
git branch --show-current
git status --short
```

Ожидается ветка `main` и пустой `git status`.

## 8. DNS

В Timeweb Cloud привяжите оба поддомена к production VPS. Это создаст две
эквивалентные записи:

```text
A  app  VPS_IP
A  api  VPS_IP
```

Не создавайте `AAAA`, пока не убедились, что провайдер выдал рабочий IPv6 и UFW
разрешает его. Если DNS обслуживает Cloudflare, на первом запуске оставьте режим
**DNS only**; проксирование можно включить после выпуска сертификатов.

Проверьте с Windows после распространения DNS:

```powershell
Resolve-DnsName app.filfitclub.ru
Resolve-DnsName api.filfitclub.ru
```

Обе записи должны показывать `VPS_IP`. Выпуск сертификата Caddy требует доступных
из интернета TCP 80 и 443. Автоматический HTTPS Caddy описан в
[официальной документации](https://caddyserver.com/docs/automatic-https).

## 9. Production env без утечки секретов

На VPS:

```bash
cd /opt/fitness
cp backend/.env.production.example backend/.env.production
chmod 600 backend/.env.production
openssl rand -hex 24
openssl rand -hex 32
openssl rand -hex 32
nano backend/.env.production
```

Первое значение используйте как `POSTGRES_PASSWORD` и в `DATABASE_URL`; второе
как `JWT_SECRET`, третье как `TELEGRAM_WEBHOOK_SECRET`. Hex безопасен внутри URL.

Обязательные значения:

```env
ENVIRONMENT=production
APP_DOMAIN=app.filfitclub.ru
API_DOMAIN=api.filfitclub.ru
ACME_EMAIL=your-real-email@example.ru
MINI_APP_URL=https://app.filfitclub.ru
VITE_API_URL=https://api.filfitclub.ru
VITE_BOT_USERNAME=fil_fit_bot

POSTGRES_USER=fitness
POSTGRES_PASSWORD=ОДНО_И_ТО_ЖЕ_HEX_ЗНАЧЕНИЕ
POSTGRES_DB=fitness
DATABASE_URL=postgresql+asyncpg://fitness:ОДНО_И_ТО_ЖЕ_HEX_ЗНАЧЕНИЕ@db:5432/fitness

CORS_ORIGINS=https://web.telegram.org,https://app.filfitclub.ru
EMAIL_OTP_DEV_RETURN_CODE=false
```

Из текущего `backend/.env` аккуратно перенесите **значения**, не сам файл:

- `BOT_TOKEN`, `BOT_USERNAME`;
- `JWT_SECRET` — лучше сохранить прежний, если он уже был production-secret;
- `LLM_API_KEY` и настройки Groq;
- SMTP-поля и `ADMIN_FEEDBACK_EMAIL`;
- `ADMIN_TELEGRAM_USERNAMES`, `ADMIN_TELEGRAM_IDS`;
- прежнюю пару `WEB_PUSH_VAPID_*` и `WEB_PUSH_VAPID_SUBJECT`;
- Sentry, если он используется.

Не переносите старые `DATABASE_URL`, `REDIS_URL`, `LOG_DIR`, `MINI_APP_URL` и
`CORS_ORIGINS`: в Docker для них нужны адреса из шаблона. Не выводите env через
`cat`, `docker compose config` или логи. Проверка без печати разрешённых значений:

```bash
docker compose --env-file backend/.env.production config --quiet
```

Убедитесь, что не осталось заглушек:

```bash
if grep -Eq 'CHANGE_ME|REPLACE_' backend/.env.production; then
  echo 'ERROR: placeholders remain'; exit 1
fi
```

## 10. Выбрать один сценарий базы

### Вариант A: чистая новая база

Если пользовательские данные переносить не надо, переходите к разделу 11.
Compose создаст PostgreSQL, расширения `pgcrypto`, `uuid-ossp`, `vector`,
`pg_trgm` и последовательно применит все SQL-миграции.

### Вариант B: перенести текущую Windows-базу без потери данных

Сначала полностью настройте VPS и env, но **не запускайте весь Compose**.

На Windows остановите запись новых данных, сохранив PostgreSQL запущенным:

```text
pause-supervisor.cmd
stop-all.cmd
```

Пока идёт финальный перенос, Mini App будет недоступен. Найдите host, port, user
и database в своём локальном `DATABASE_URL`, не публикуя пароль. Создайте дамп
клиентом PostgreSQL 18:

```powershell
$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
& $pgDump -h 127.0.0.1 -p 5432 -U postgres -d fitness `
  --format=custom --no-owner --no-privileges `
  -f "$env:USERPROFILE\Desktop\fitness-cutover.dump"
```

Если локальные user/port/database отличаются, подставьте фактические. Пароль
введите в prompt; не добавляйте его в команду. Проверьте архив:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' `
  --list "$env:USERPROFILE\Desktop\fitness-cutover.dump" | Select-Object -First 10
Get-FileHash "$env:USERPROFILE\Desktop\fitness-cutover.dump" -Algorithm SHA256
```

Папку на VPS подготовьте **до** команды `scp`:

```bash
mkdir -p /opt/fitness/backups
chmod 700 /opt/fitness/backups
```

Затем выполните на Windows:

```powershell
scp -i $env:USERPROFILE\.ssh\fitness_vps `
  "$env:USERPROFILE\Desktop\fitness-cutover.dump" `
  deploy@VPS_IP:/opt/fitness/backups/import.dump
```

На VPS поднимите только пустую БД и Redis, затем восстановите дамп:

```bash
cd /opt/fitness
docker compose --env-file backend/.env.production up -d db redis
docker compose --env-file backend/.env.production exec -T db \
  pg_isready -U fitness -d fitness
docker compose --env-file backend/.env.production exec -T db \
  pg_restore -U fitness -d fitness --exit-on-error --no-owner --no-privileges \
  < backups/import.dump
```

Это должно выполняться только в новой пустой `pgdata`. Если `pg_restore`
сообщает `already exists`, остановитесь: не добавляйте `--clean` и не удаляйте
volume, пока не доказано, что в VPS-базе нет нужных данных.

Локальный Windows PostgreSQL может хранить `exercises.embedding` как
`double precision[]`, если pgvector не был установлен. Это ожидаемый fallback.
Перед исторической HNSW-миграцией Compose автоматически запускает append-only
normalizer `20260823000021_restore_local_embedding_to_vector.sql`: NULL и
корректные 1536-мерные значения сохраняются и переводятся в `vector(1536)`. При
неверной размерности миграция намеренно останавливается, не уничтожая данные.

Сравните основные количества с исходной базой (значения должны совпадать):

```bash
docker compose --env-file backend/.env.production exec -T db psql \
  -U fitness -d fitness -c \
  "select 'users' n,count(*) from users union all select 'workouts',count(*) from workouts union all select 'workout_sets',count(*) from workout_sets union all select 'nutrition_logs',count(*) from nutrition_logs;"
```

После проверки удалите дамп с VPS только когда уже создана первая независимая
резервная копия и скопирована на другой носитель.

## 11. Первый запуск

```bash
cd /opt/fitness
docker compose --env-file backend/.env.production pull db redis caddy
docker compose --env-file backend/.env.production build --pull
docker compose --env-file backend/.env.production up -d --remove-orphans
docker compose --env-file backend/.env.production ps -a
```

`migrate` должен завершиться с кодом 0; постоянно `Up/healthy` должны быть `db`,
`redis`, `api`, `worker`, `web`, `caddy`. Посмотрите только последние строки:

```bash
docker compose --env-file backend/.env.production logs --tail=100 migrate
docker compose --env-file backend/.env.production logs --tail=100 api worker caddy
```

Загрузите версионированный каталог. Оба seed идемпотентны:

```bash
docker compose --env-file backend/.env.production run --rm api \
  python scripts/seed_prod_content.py
docker compose --env-file backend/.env.production run --rm api \
  python scripts/seed_nutrition.py
```

## 12. Telegram и GitHub monitor

Когда `https://api.filfitclub.ru/health` уже отвечает, зарегистрируйте новый
webhook и обновите Menu Button всех связанных пользователей:

```bash
docker compose --env-file backend/.env.production run --rm api \
  python scripts/sync_telegram_entrypoints.py \
  --webhook-base https://api.filfitclub.ru
```

Ожидаются новый `WEBHOOK=https://api.filfitclub.ru/telegram/webhook`, нулевой
`WEBHOOK_LAST_ERROR` и разумное число `CHAT_MENUS_UPDATED`. Не используйте
`--send-welcome-all` без отдельного решения: это массовая рассылка.

В GitHub → **Settings → Secrets and variables → Actions → Variables** задайте:

```text
PUBLIC_HEALTH_URL=https://api.filfitclub.ru/health
```

Запустите workflow **Public health monitor** вручную. После смены этой переменной
старый Tailscale Funnel больше не влияет на probe.

## 13. Полная проверка после запуска

```bash
curl --fail --silent --show-error https://api.filfitclub.ru/health
curl --fail --silent --show-error -I https://app.filfitclub.ru/

docker compose --env-file backend/.env.production exec -T redis redis-cli ping
docker compose --env-file backend/.env.production exec -T db psql \
  -U fitness -d fitness -c "select extname,extversion from pg_extension order by 1;"
docker compose --env-file backend/.env.production exec -T db psql \
  -U fitness -d fitness -c "select count(*) as exercises from exercises where not is_deleted;"
docker compose --env-file backend/.env.production exec -T db psql \
  -U fitness -d fitness -c "select count(*) as programs from programs where not is_deleted;"
docker compose --env-file backend/.env.production logs --since=10m api worker
df -h
free -h
```

Затем вручную проверьте:

1. `/start` в Telegram и кнопку открытия Mini App.
2. Telegram-авторизацию, старт и завершение тестовой тренировки.
3. Browser email OTP. При неработающем SMTP production API не должен возвращать
   `dev_code`.
4. Чат ИИ, если задан `LLM_API_KEY`.
5. Тестовое уведомление добавки и Web Push.
6. Перезагрузку VPS: `sudo reboot`, затем `docker compose ps` и `/health`.

Смена домена меняет browser origin. Старые JWT/localStorage и Web Push
subscription с Funnel-origin технически не переносятся: browser-пользователям
нужно войти заново, а Web Push включить заново. Данные PostgreSQL при этом
сохраняются. Telegram получит новый JWT автоматически после открытия Mini App.

## 14. Резервные копии

Backup провайдера полезен при поломке всего VPS, но не заменяет отдельный дамп
PostgreSQL. Проверьте проектный скрипт вручную:

```bash
cd /opt/fitness
sh scripts/backup_vps.sh
ls -lh backups/vps
```

Он создаёт custom-format dump, проверяет его через `pg_restore --list`, пишет
SHA-256 и не удаляет старые копии. Добавьте ежедневный cron:

```bash
mkdir -p /opt/fitness/logs
chmod 700 /opt/fitness/logs
crontab -e
```

```cron
17 2 * * * cd /opt/fitness && /bin/sh scripts/backup_vps.sh >> /opt/fitness/logs/backup.log 2>&1
```

Не реже раза в неделю копируйте свежий `.dump` и `.sha256` с VPS на другой
носитель/S3. Backup, лежащий только на том же диске, не защищает от потери VPS.

Тест восстановления делайте в отдельную временную БД, не поверх production:

```bash
docker compose --env-file backend/.env.production exec -T db \
  createdb -U fitness fitness_restore_test
docker compose --env-file backend/.env.production exec -T db \
  pg_restore -U fitness -d fitness_restore_test --exit-on-error \
  --no-owner --no-privileges \
  < backups/vps/ИМЯ.dump
docker compose --env-file backend/.env.production exec -T db psql \
  -U fitness -d fitness_restore_test -c "select count(*) from users;"
docker compose --env-file backend/.env.production exec -T db \
  dropdb -U fitness fitness_restore_test
```

## 15. Безопасное обновление приложения

Перед каждым обновлением:

```bash
cd /opt/fitness
git status --short
git fetch --prune origin
git log --oneline HEAD..origin/main
sh scripts/backup_vps.sh
git pull --ff-only origin main
docker compose --env-file backend/.env.production config --quiet
docker compose --env-file backend/.env.production build --pull
docker compose --env-file backend/.env.production up -d --remove-orphans
docker compose --env-file backend/.env.production run --rm api \
  python scripts/seed_prod_content.py
docker compose --env-file backend/.env.production run --rm api \
  python scripts/seed_nutrition.py
curl --fail --silent --show-error https://api.filfitclub.ru/health
docker compose --env-file backend/.env.production ps -a
```

Миграции применятся автоматически до запуска нового API. Старые hashed frontend
chunks сохраняются в volume, поэтому уже открытые Telegram/PWA-клиенты не должны
получать 404 сразу после публикации.

Никогда не выполняйте `docker compose down -v`: `-v` удаляет PostgreSQL, Redis,
сертификаты Caddy и сохранённые frontend releases. Обычный `docker compose down`
volumes не удаляет, но для обновления он не нужен.

Если новый код неисправен, верните предыдущий проверенный commit и пересоберите
контейнеры. SQL-миграции считаются forward-only: откат кода не откатывает схему.
При несовместимой миграции восстановление возможно только из дампа, созданного
до обновления.

## 16. Диагностика

| Симптом | Проверка |
|---|---|
| Caddy не получает сертификат | DNS A указывает на VPS; 80/443 разрешены в панели провайдера и UFW; `docker compose logs caddy` |
| API не стартует | `docker compose logs migrate api`; пароль одинаков в `POSTGRES_PASSWORD` и `DATABASE_URL` |
| `extension vector is not available` | Должен использоваться pinned image `pgvector/pgvector:0.8.6-pg18-bookworm`, не plain `postgres` |
| Telegram не отвечает | `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `getWebhookInfo` через sync-скрипт, публичный `api` HTTPS |
| Email OTP не приходит | SMTP host/port/SSL/login; `EMAIL_OTP_DEV_RETURN_CODE` всё равно оставить `false` |
| Уведомления не приходят | `worker` Up, Redis `PONG`, VAPID-пара совпадает у API/worker, Telegram webhook принимает callback |
| Заканчивается диск | `df -h`, размеры `backups/vps`, Docker `docker system df`; сначала выгрузить backup, не удалять volumes |
| Не хватает RAM при build | `free -h`, swap активен; при регулярном OOM перейти на 6–8 ГБ RAM |

После успешного VPS-cutover старый Windows supervisor и Tailscale Funnel можно
остановить. Не делайте это раньше проверки Telegram, browser OTP, worker,
резервного копирования и GitHub monitor на новом домене.
