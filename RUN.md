# Как запускать Fitness Mini App

## Обычный полный запуск

Запускает Redis, уведомления, backend, frontend, Tailscale Funnel и Telegram:

```text
C:\fitness_prog\start_all_comand.bat
```

## Запуск без фоновых уведомлений

```text
C:\fitness_prog\start-all.cmd
```

## Проверка

```text
C:\fitness_prog\status.cmd
C:\fitness_prog\status-notifications.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\device_ops_check.ps1
```

Tailscale должен быть установлен и подключён, но открывать его сайт после входа не нужно. Компьютер должен оставаться включённым и не переходить в сон.

Полная инструкция первого развёртывания, настройки Telegram, Tailscale, базы, уведомлений и диагностики: [docs/LOCAL_ADMIN_GUIDE.md](docs/LOCAL_ADMIN_GUIDE.md).
