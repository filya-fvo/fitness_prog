# Локальное развёртывание Fitness Mini App — инструкция администратора

Эта инструкция описывает запуск проекта на Windows-компьютере с публичным HTTPS через Tailscale Funnel. Бесплатный ngrok использовать нельзя: его адреса устаревают, а пользователи видят предупреждение.

## 1. Как устроен локальный сервер

На администраторском компьютере работают:

| Компонент | Назначение | Порт |
|---|---|---:|
| PostgreSQL | пользователи, тренировки, питание | 5432 |
| Redis | очередь уведомлений и таймеров | 6379 |
| FastAPI backend | API и Telegram webhook | 8001 |
| Vite frontend | интерфейс Mini App и прокси к API | 5173 |
| Tailscale Funnel | постоянный публичный HTTPS → frontend | 443 |
| ARQ worker | уведомления и фоновые задачи | — |

Публичный трафик идёт через Tailscale на frontend. Vite отправляет API-запросы и `/telegram/webhook` на локальный backend, поэтому отдельный публичный порт API не нужен.

Компьютер должен быть включён, подключён к интернету и не находиться в спящем режиме. Открытая страница Tailscale в браузере не нужна: после входа работает служба Windows.

## 2. Что установить один раз

Рекомендуемое расположение проекта:

```text
C:\fitness_prog
```

`start_all_comand.bat` использует этот путь. Если проект расположен иначе, измените переменную `Folder` в начале файла.

Потребуются:

1. Windows 10/11 x64 и права администратора.
2. Python версии, совместимой с `backend/pyproject.toml`.
3. Node.js LTS и `npm`.
4. PostgreSQL либо доступ к существующей PostgreSQL/Supabase базе.
5. Tailscale для Windows: <https://tailscale.com/download/windows>.
6. Telegram-бот и токен от BotFather.

Для AI, почтовых кодов и Web Push дополнительно потребуются соответствующие ключи. Без них основная часть приложения запускается, но связанные функции будут недоступны.

## 3. Подготовка проекта

### 3.1. Backend

Откройте PowerShell:

```powershell
cd C:\fitness_prog\backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -e ".[dev]"
```

Скопируйте `backend\.env.example` в `backend\.env`. Реальный `.env` нельзя отправлять в Git или передавать посторонним.

Минимально заполните:

```dotenv
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@127.0.0.1:5432/fitness
BOT_TOKEN=токен_от_BotFather
BOT_USERNAME=имя_бота_без_собаки
JWT_SECRET=длинная_случайная_строка
TELEGRAM_WEBHOOK_SECRET=другая_длинная_случайная_строка
ADMIN_TELEGRAM_USERNAMES=UsernameАдминистратора
ADMIN_TELEGRAM_IDS=числовой_Telegram_ID_администратора
REDIS_URL=redis://127.0.0.1:6379/0
```

`MINI_APP_URL` вручную придумывать не нужно: `start-all.cmd` запишет адрес Funnel автоматически.

Для локального PostgreSQL в Windows используйте `127.0.0.1`, а не `localhost`.

Примените миграции:

```powershell
cd C:\fitness_prog
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply_migrations_local.ps1
```

Если база новая, загрузите системный контент:

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\seed_prod_content.py
.\.venv\Scripts\python.exe scripts\seed_nutrition.py
```

### 3.2. Frontend

```powershell
cd C:\fitness_prog\frontend
npm.cmd install
```

### 3.3. Tailscale

1. Установите Tailscale.
2. Нажмите **Log in** в значке Tailscale возле часов и войдите в аккаунт.
3. Оставьте включённым MagicDNS.
4. При первом `start-all.cmd` подтвердите UAC и страницу **Enable Funnel**.

Funnel публикует только frontend `127.0.0.1:5173`. Открывать входящие порты на роутере или настраивать белый IP не требуется.

Постоянный URL сохраняется локально в:

```text
scripts\tailscale-url.local.env
```

Этот файл и `backend\.env` исключены из Git.

## 4. Какой файл запускать

### Полный рабочий режим — рекомендуется

Дважды щёлкните:

```text
C:\fitness_prog\start_all_comand.bat
```

Он запускает:

1. Redis;
2. worker уведомлений;
3. backend;
4. frontend;
5. Tailscale Funnel;
6. настройку Telegram Menu Button и webhook.

Не закрывайте окна Redis, Notifications, Backend и Frontend. Окно браузера Tailscale держать открытым не требуется.

### Базовый режим без фоновых уведомлений

```text
C:\fitness_prog\start-all.cmd
```

Приложение и Telegram будут работать, но запланированные уведомления, фоновые таймеры и некоторые отложенные задачи требуют отдельно запущенных Redis и worker.

### Только локальная разработка без Telegram и Funnel

```bat
C:\fitness_prog\start-all.cmd -SkipTunnel -SkipTelegram
```

## 5. Что делает `start-all.cmd`

При каждом полном запуске скрипт:

1. проверяет импорт backend и зависимости frontend;
2. запускает API и интерфейс;
3. использует постоянный `*.ts.net` адрес Tailscale;
4. записывает его в `MINI_APP_URL`;
5. перезапускает backend с актуальным адресом;
6. обновляет общий Telegram Menu Button;
7. обновляет персональные Menu Button всех Telegram-пользователей из базы;
8. регистрирует webhook с событиями `message` и `callback_query`.

Настройка блокирует любые адреса, в имени которых присутствует `ngrok`.

## 6. Telegram и старые кнопки

URL inline-кнопки хранится внутри конкретного Telegram-сообщения. Telegram не позволяет массово изменить старые сообщения без сохранённых `message_id`.

После смены адреса:

1. не используйте Open в старых сообщениях;
2. отправьте боту `/start`;
3. используйте Open в новом ответе или синюю кнопку меню возле поля ввода.

Новые приветствия, напоминания и уведомления получают текущий `MINI_APP_URL` автоматически.

Если в BotFather ранее настраивалась отдельная **Main Mini App / Direct Link**, обновите её URL на текущий адрес из `scripts\tailscale-url.local.env` либо не используйте старую direct link. Menu Button и inline-кнопки приложения основной скрипт настраивает через Telegram Bot API сам.

Для принудительной синхронизации всех персональных кнопок:

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\sync_telegram_entrypoints.py
```

Чтобы отправить конкретному привязанному пользователю новое сообщение Open:

```powershell
.\.venv\Scripts\python.exe scripts\sync_telegram_entrypoints.py --send-open-to 123456789
```

Чтобы отправить всем привязанным пользователям эквивалент нового `/start` — приветствие с актуальной inline-кнопкой и отдельное сообщение, обновляющее постоянную клавиатуру Open, `/start`, `/help`:

```powershell
.\.venv\Scripts\python.exe scripts\sync_telegram_entrypoints.py --send-welcome-all
```

История переписки при этом не очищается. Telegram Bot API удаляет сообщения только по известным `message_id` и в общем случае только моложе 48 часов; проект не хранит идентификаторы всех старых приветствий. Массово удалять пользовательскую историю бот не может.

## 7. Проверка после запуска

Быстрая проверка процессов:

```text
C:\fitness_prog\status.cmd
C:\fitness_prog\status-notifications.cmd
```

Полная проверка локальных сервисов, Funnel, webhook и Menu Button:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\device_ops_check.ps1
```

Проверка персональной Menu Button:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\device_ops_check.ps1 -TelegramChatId 123456789
```

Нормальный результат:

- локальные `http://127.0.0.1:8001/health` и `http://127.0.0.1:5173` отвечают;
- публичные `/` и `/health` отвечают `200`;
- `MINI_APP_URL`, сохранённый Funnel URL, webhook и Menu Button совпадают;
- нигде нет `ngrok`;
- webhook не содержит `last_error_message`.

После этого в Telegram отправьте `/start` и проверьте новую кнопку Open.

## 8. Ежедневная работа

После перезагрузки компьютера:

1. убедитесь, что PostgreSQL работает;
2. убедитесь, что Tailscale показывает состояние Connected;
3. запустите `start_all_comand.bat`;
4. выполните `status.cmd` и при необходимости `device_ops_check.ps1`.

Сайт Tailscale открывать не нужно. Повторно входить требуется только после выхода из аккаунта, удаления устройства из tailnet или переустановки Tailscale.

Отключите сон компьютера при работе от сети. При выключенном ПК публичный адрес сохранится, но приложение отвечать не будет.

## 9. Остановка

Backend и frontend:

```text
C:\fitness_prog\stop-all.cmd
```

Worker и Redis остановите закрытием их отдельных окон. Конфигурация Tailscale Funnel сохраняется и будет снова обслуживать приложение после следующего запуска frontend.

## 10. Обновление проекта

После получения новой версии:

1. сделайте резервную копию базы;
2. не заменяйте свой `backend\.env` чужим файлом;
3. обновите зависимости;
4. примените новые миграции;
5. запустите тесты;
6. перезапустите полный стек.

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\pip.exe install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest -q

cd C:\fitness_prog\frontend
npm.cmd install
npm.cmd test -- --run
npm.cmd run build
```

## 11. Частые проблемы

| Симптом | Что проверить |
|---|---|
| Старое окно ngrok | Нажата кнопка в старом сообщении; отправьте `/start` и используйте новую кнопку |
| Синяя кнопка ведёт не туда | Запустите `start-all.cmd`, затем `device_ops_check.ps1 -TelegramChatId ...` |
| Публичный адрес не отвечает | Tailscale Connected, ПК не спит, frontend работает на 5173 |
| Funnel не включается | Войдите в Tailscale, включите MagicDNS и подтвердите Enable Funnel |
| `/start` молчит | Backend работает, webhook совпадает с `MINI_APP_URL/telegram/webhook` |
| Кнопки добавок не работают | В webhook должны быть `message` и `callback_query` |
| Нет уведомлений | Redis и Notifications worker должны работать |
| Backend не стартует | Проверьте `DATABASE_URL`, PostgreSQL и окно Backend |
| Frontend не стартует | Выполните `npm.cmd install` в `frontend` |
| После выключения всё недоступно | Для локального размещения это ожидаемо; нужен постоянно включённый ПК или облачный сервер |

## 12. Безопасность

- Не публикуйте `.env`, токены, JWT secret, SMTP-пароли и ключи AI.
- Не отправляйте публично содержимое логов без проверки токенов и персональных данных.
- Регулярно создавайте резервные копии PostgreSQL.
- Не отключайте проверку Telegram initData или webhook secret.
- Не открывайте PostgreSQL и Redis напрямую в интернет.
- Публичным должен быть только HTTPS Funnel к frontend.
