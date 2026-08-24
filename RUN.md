# Как запускать Fitness Mini App

## Первая установка на новом Windows-сервере

Перенесите проект в любую постоянную папку и запустите:

```text
install-server.cmd
```

Supervisor теперь необязателен и обслуживает только локальные API, Redis и worker.
Если он нужен, после установки запустите `install-supervisor.cmd`; проверка —
`supervisor-status.cmd`. Production без локального компьютера работает в Timeweb
App Platform: [docs/TIMEWEB_DOMAIN_CUTOVER.md](docs/TIMEWEB_DOMAIN_CUTOVER.md).

## Обычный полный запуск

Запускает локальные Redis и уведомления, безопасно собирает интерфейс с
сохранением ассетов восьми последних сборок и поднимает единое локальное
приложение на `:8001`. Публичные домены и Telegram webhook эта команда не меняет:

```text
start_all_comand.bat
```

Vite на `:5173` в рабочем режиме больше не нужен. Публичный и локальный интерфейс вместе с API обслуживает FastAPI:

```text
http://127.0.0.1:8001
```

## Постоянная работа без ручного перезапуска

После `install-server.cmd` один раз установите supervisor и подтвердите запрос Windows UAC:

```text
install-supervisor.cmd
```

Supervisor стартует вместе с Windows, проверяет локальные API, Redis и worker
каждые 30 секунд и восстанавливает их после сбоя. Он не управляет публичным
доменом и Telegram webhook. Статус: `supervisor-status.cmd`; обслуживание:
`pause-supervisor.cmd`, затем `resume-supervisor.cmd`.

Worker уведомлений работает без отдельного окна. Его состояние видно в `supervisor-status.cmd` и `status-notifications.cmd`, события рассылки — в `logs\worker-YYYY-MM-DD.log`. После изменения supervisor-скриптов повторно запустите `install-supervisor.cmd`, чтобы текущая системная задача сразу загрузила новую версию.

## Разработка и публикация

Для разработки дважды щёлкните `dev-local.cmd`. Он приостановит supervisor и запустит backend с автоперезагрузкой и Vite на `http://127.0.0.1:5173` без перенастройки Telegram.

Когда версия готова для пользователей, запустите:

```text
publish-local.cmd
```

Скрипт соберёт локальный frontend, опубликует его через локальный FastAPI и снова
включит supervisor. Production-релиз Timeweb собирается из GitHub автоматически.

## Запуск без фоновых уведомлений

```text
start-all.cmd
```

## Проверка

```text
status.cmd
status-notifications.cmd
supervisor-status.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\device_ops_check.ps1
```

Проверка публичного домена обращается к `https://app.filfitclub.ru` и
`https://api.filfitclub.ru`; Tailscale на локальном компьютере не требуется.

## Очистка места на локальном компьютере

Без удаления сначала покажите найденные временные данные:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-local.ps1
```

После проверки списка добавьте `-Apply`. Для одноразового удаления также
восстанавливаемых зависимостей и проверенных старых архивов используйте
`-Apply -Deep`. Полное описание ограничений и ежедневной задачи находится в
[docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md#12-очистка-места-на-локальном-компьютере).

Полная инструкция локальной установки, базы, уведомлений и диагностики:
[docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md).
