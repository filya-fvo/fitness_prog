# Как запускать Fitness Mini App

## Обычный полный запуск

Запускает Redis, уведомления, собирает production-интерфейс, поднимает единое приложение на `:8001`, Tailscale Funnel и обновляет Telegram:

```text
C:\fitness_prog\start_all_comand.bat
```

Vite на `:5173` в рабочем режиме больше не нужен. Публичный и локальный интерфейс вместе с API обслуживает FastAPI:

```text
http://127.0.0.1:8001
```

## Постоянная работа без ручного перезапуска

После первого успешного полного запуска один раз установите supervisor и подтвердите запрос Windows UAC:

```text
C:\fitness_prog\install-supervisor.cmd
```

Supervisor стартует вместе с Windows, проверяет приложение и Tailscale Funnel каждые 30 секунд и восстанавливает их после сбоя. Статус: `supervisor-status.cmd`; обслуживание: `pause-supervisor.cmd`, затем `resume-supervisor.cmd`.

## Разработка и публикация

Для разработки дважды щёлкните `dev-local.cmd`. Он приостановит supervisor и запустит backend с автоперезагрузкой и Vite на `http://127.0.0.1:5173` без перенастройки Telegram.

Когда версия готова для пользователей, запустите:

```text
C:\fitness_prog\publish-local.cmd
```

Скрипт соберёт frontend, опубликует его через FastAPI/Funnel и снова включит supervisor.

## Запуск без фоновых уведомлений

```text
C:\fitness_prog\start-all.cmd
```

## Проверка

```text
C:\fitness_prog\status.cmd
C:\fitness_prog\status-notifications.cmd
C:\fitness_prog\supervisor-status.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\device_ops_check.ps1
```

Tailscale должен быть установлен и подключён, но открывать его сайт после входа не нужно. Компьютер должен оставаться включённым и не переходить в сон.

Полная инструкция первого развёртывания, настройки Telegram, Tailscale, базы, уведомлений и диагностики: [docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md).
