# Подключение DBeaver к production PostgreSQL

Production-база не открыта в интернет. DBeaver подключается к ней только через
SSH-туннель до VPS. На сервере PostgreSQL привязан к loopback-порту
`127.0.0.1:15432`; публичные порты `5432` и `15432` в firewall открывать нельзя.

## 1. Данные подключения

Во время первого подключения можно использовать роль приложения:

- база: `fitness`;
- пользователь: `fitness`;
- пароль: значение `POSTGRES_PASSWORD` из `/opt/fitness/source/backend/.env.production`;
- PostgreSQL на стороне VPS: `127.0.0.1:15432`.

Пароль не копируйте в переписку и не сохраняйте в Git. Посмотреть его можно в
своём SSH-сеансе на VPS. После настройки лучше создать отдельную роль DBeaver,
как описано ниже.

## 2. Настройка DBeaver

1. Нажмите **Новое соединение → PostgreSQL**.
2. На вкладке **Основные** укажите:
   - **Host**: `127.0.0.1`;
   - **Port**: `15432`;
   - **Database**: `fitness`;
   - **Username**: `fitness` или отдельная роль `fitness_dbeaver`;
   - **Password**: пароль выбранной роли.
3. Откройте вкладку **SSH** и включите **Use SSH Tunnel**:
   - **Host/IP**: `201.24.48.145`;
   - **Port**: `22`;
   - **User name**: `root`;
   - **Authentication method**: `Public Key`;
   - **Private key**: `C:\Users\broadview\.ssh\fitness_timeweb`;
   - passphrase укажите только если ключ ею защищён.
4. Нажмите **Test tunnel configuration**, затем **Test Connection**.
5. При первом запуске разрешите DBeaver скачать официальный PostgreSQL JDBC
   driver.

SSL на вкладке PostgreSQL включать не требуется: весь канал уже шифруется SSH,
а PostgreSQL принимает соединение только на loopback-интерфейсе VPS.

## 3. Отдельная роль для повседневной работы

Чтобы не хранить пароль приложения в DBeaver, один раз откройте `psql` через SSH:

```powershell
ssh -i "$env:USERPROFILE\.ssh\fitness_timeweb" root@201.24.48.145
cd /opt/fitness/source
docker compose --env-file backend/.env.production exec db psql -U fitness -d fitness
```

Внутри `psql` создайте роль без административных прав и задайте пароль через
интерактивный запрос, чтобы он не попал в историю команд:

```sql
CREATE ROLE fitness_dbeaver LOGIN;
\password fitness_dbeaver
GRANT CONNECT ON DATABASE fitness TO fitness_dbeaver;
GRANT USAGE ON SCHEMA public TO fitness_dbeaver;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fitness_dbeaver;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO fitness_dbeaver;
ALTER DEFAULT PRIVILEGES FOR ROLE fitness IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fitness_dbeaver;
ALTER DEFAULT PRIVILEGES FOR ROLE fitness IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO fitness_dbeaver;
```

Выйдите командой `\q` и замените пользователя/пароль в DBeaver на
`fitness_dbeaver`.

Эта роль подходит для просмотра и аккуратного редактирования данных, но не для
изменения схемы. Структуру production-базы меняйте только append-only миграциями
из `supabase/migrations/`, иначе код и схема разойдутся.

## 4. Быстрая диагностика

На VPS локальный порт должен слушать только `127.0.0.1`:

```bash
ss -lnt '( sport = :15432 )'
```

Ожидаемый адрес — `127.0.0.1:15432`, но не `0.0.0.0:15432` и не
`[::]:15432`. Если DBeaver сообщает `Connection refused`, сначала проверьте
контейнер:

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production ps db
```

Если SSH-туннель не создаётся, проверьте путь к ключу, пользователя `root` и то,
что обычная команда `ssh` с этим ключом подключается к VPS.
