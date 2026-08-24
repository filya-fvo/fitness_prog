"""Static guarantees for the one-command Windows server installation flow."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_local_cleanup_is_safe_and_dry_run_by_default() -> None:
    cleanup = (ROOT / "scripts" / "cleanup-local.ps1").read_text(encoding="utf-8")
    task = (ROOT / "scripts" / "install-local-cleanup-task.ps1").read_text(
        encoding="utf-8"
    )
    redis_installer = (ROOT / "scripts" / "install-redis-portable.py").read_text(
        encoding="utf-8"
    )

    assert "[switch]$Apply" in cleanup
    assert "[switch]$Deep" in cleanup
    assert "[int]$OlderThanDays = 2" in cleanup
    assert "if (-not $Apply)" in cleanup
    for protected in (
        '"backend\\.venv"',
        '"backups\\exercises-dataset-src"',
        '"backups\\vps"',
        '"docs"',
        '"frontend\\dist"',
        '"frontend\\public"',
        '"supabase"',
        '"tools\\redis\\dump.rdb"',
    ):
        assert protected in cleanup
    assert "git clean" not in cleanup.lower()
    assert "docker system prune" not in cleanup.lower()

    arguments_line = next(line for line in task.splitlines() if line.startswith("$arguments"))
    assert "#Requires -RunAsAdministrator" in task
    assert "-Apply -OlderThanDays $OlderThanDays" in arguments_line
    assert "-Deep" not in arguments_line
    assert 'DEST.glob(pattern)' in redis_installer
    assert 'ZIP_PATH.unlink(missing_ok=True)' in redis_installer


def test_server_installer_covers_required_stack() -> None:
    launcher = (ROOT / "install-server.cmd").read_text(encoding="utf-8")
    installer = (ROOT / "scripts" / "install-server.ps1").read_text(encoding="utf-8")

    assert "scripts\\install-server.ps1" in launcher
    for marker in (
        "python312",
        "nodejs-lts",
        "postgresql18",
        "install-redis-portable.py",
        "apply_migrations_local.ps1",
        "seed_prod_content.py",
        "seed_nutrition.py",
        "-DryRun",
    ):
        assert marker in installer
    assert "tailscale" not in installer.lower()


def test_server_runtime_scripts_do_not_depend_on_old_root() -> None:
    runtime_files = (
        "start_all_comand.bat",
        "scripts/start-all.ps1",
        "scripts/start-redis.ps1",
        "scripts/start-notifications.ps1",
        "scripts/fitness-supervisor.ps1",
        "scripts/install-fitness-supervisor.ps1",
        "scripts/restart-production-api.ps1",
        "scripts/request-production-restart.ps1",
        "scripts/apply_migrations_local.ps1",
    )
    for relative in runtime_files:
        text = (ROOT / relative).read_text(encoding="utf-8").lower()
        assert "c:\\fitness_prog" not in text, relative

    supervisor = (ROOT / "scripts" / "fitness-supervisor.ps1").read_text(encoding="utf-8")
    installer = (ROOT / "scripts" / "install-fitness-supervisor.ps1").read_text(encoding="utf-8")
    assert "supervisor-heartbeat.json" in supervisor
    assert "restart-api.request" in supervisor
    assert "restart-worker.request" in supervisor
    assert "Invoke-RequestedApiRestart" in supervisor
    assert "Invoke-RequestedWorkerRestart" in supervisor
    assert 'Start-HiddenPowerShell $StartNotifications @("-Headless")' in supervisor
    assert '($_.Name -match "powershell")' in supervisor
    assert '($_.CommandLine -match "notification-worker\\.lock")' in supervisor
    assert "Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue" in supervisor
    assert "supervisor-install-status.json" in installer
    assert "Stop-ScheduledTask -TaskName $TaskName" in installer
    assert "tailscale" not in supervisor.lower()
    assert "tailscale" not in installer.lower()

    start_all = (ROOT / "scripts" / "start-all.ps1").read_text(encoding="utf-8")
    assert "tailscale" not in start_all.lower()
    assert "https://app.filfitclub.ru" in start_all
    assert "https://api.filfitclub.ru" in start_all

    notification_launcher = (ROOT / "scripts" / "start-notifications.ps1").read_text(
        encoding="utf-8"
    )
    assert "[switch]$Headless" in notification_launcher
    assert "notification-worker-launcher.log" in notification_launcher
    assert "notification-worker-stdout.log" in notification_launcher
    assert "notification-worker-stderr.log" in notification_launcher
    assert "Start-Process -FilePath $Arq" in notification_launcher
    assert "-RedirectStandardError $ConsoleErrorLog" in notification_launcher
    assert '$env:PYTHONIOENCODING = "utf-8"' in notification_launcher

    restart_api = (ROOT / "scripts" / "restart-production-api.ps1").read_text(encoding="utf-8")
    assert "#Requires -RunAsAdministrator" in restart_api
    assert "Get-NetTCPConnection -LocalPort 8001" in restart_api
    assert "Refusing to stop unexpected listener" in restart_api

    restart_all = (ROOT / "scripts" / "request-production-restart.ps1").read_text(
        encoding="utf-8"
    )
    assert "restart-api.request" in restart_all
    assert "restart-worker.request" in restart_all

    launcher = (ROOT / "start_all_comand.bat").read_text(encoding="utf-8")
    assert "%~dp0" in launcher


def test_public_health_monitor_uses_the_permanent_api_domain() -> None:
    workflow = (ROOT / ".github" / "workflows" / "public-health-monitor.yml").read_text(
        encoding="utf-8"
    )

    assert "for attempt in $(seq 1 6)" in workflow
    assert "sleep 15" in workflow
    assert 'exit "$last_status"' in workflow
    assert "https://api.filfitclub.ru/health" in workflow
    assert "tailscale" not in workflow.lower()


def test_vps_compose_keeps_data_services_private_and_runs_migrations() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "pgvector/pgvector:0.8.6-pg18-bookworm" in compose
    assert "pgdata:/var/lib/postgresql\n" in compose
    assert "pgdata:/var/lib/postgresql/data" not in compose
    assert "./supabase/migrations:/migrations:ro" in compose
    assert "20260823000021_restore_local_embedding_to_vector.sql" in compose
    assert 'psql -v ON_ERROR_STOP=1 -f "$$bootstrap"' in compose
    assert "condition: service_completed_successfully" in compose
    assert '"80:80"' in compose
    assert '"443:443"' in compose
    for forbidden_port in ('"5432:5432"', '"6379:6379"', '"8000:8000"', '"8080:80"'):
        assert forbidden_port not in compose
    for volume in (
        "pgdata:",
        "redisdata:",
        "backend_logs:",
        "backend_data:",
        "frontend_releases:",
        "caddy_data:",
    ):
        assert volume in compose

    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "docker compose --env-file backend/.env.production config --quiet" in ci
    assert "Test production migrations and Windows fallback restore" in ci
    assert "ALTER TABLE exercises ADD COLUMN embedding double precision[]" in ci
    assert 'test "$actual" = "vector(1536)"' in ci
    assert "docker build -t fitness-api:ci ./backend" in ci
    assert "-t fitness-web:ci ./frontend" in ci


def test_vps_images_and_production_env_cover_runtime_requirements() -> None:
    backend_dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_entrypoint = (
        ROOT / "frontend" / "docker-entrypoint.d" / "40-publish-release.sh"
    ).read_text(encoding="utf-8")
    production_env = (ROOT / "backend" / ".env.production.example").read_text(
        encoding="utf-8"
    )

    assert "COPY scripts ./scripts" in backend_dockerfile
    assert "mkdir -p /app/logs /app/data" in backend_dockerfile
    assert "npm run build:publish" in frontend_dockerfile
    assert "COPY --from=build /app/dist /opt/fitness-release" in frontend_dockerfile
    assert 'target_dir=/usr/share/nginx/html' in frontend_entrypoint
    assert 'cp -a "$source_dir/." "$target_dir/"' in frontend_entrypoint
    for variable in (
        "APP_DOMAIN=",
        "API_DOMAIN=",
        "ACME_EMAIL=",
        "MINI_APP_URL=",
        "VITE_API_URL=",
        "POSTGRES_PASSWORD=",
        "DATABASE_URL=postgresql+asyncpg://",
        "EMAIL_OTP_DEV_RETURN_CODE=false",
    ):
        assert variable in production_env
    assert "APP_DOMAIN=app.filfitclub.ru" in production_env
    assert "API_DOMAIN=api.filfitclub.ru" in production_env
    assert "MINI_APP_URL=https://app.filfitclub.ru" in production_env
    assert "VITE_API_URL=https://api.filfitclub.ru" in production_env


def test_vps_runbook_requires_backup_and_safe_volume_handling() -> None:
    guide = (ROOT / "docs" / "VPS_DEPLOYMENT_GUIDE.md").read_text(encoding="utf-8")
    backup = (ROOT / "scripts" / "backup_vps.sh").read_text(encoding="utf-8")
    telegram_sync = (ROOT / "backend" / "scripts" / "sync_telegram_entrypoints.py").read_text(
        encoding="utf-8"
    )

    assert "sh scripts/backup_vps.sh" in guide
    assert "Никогда не выполняйте `docker compose down -v`" in guide
    assert "--webhook-base https://api.filfitclub.ru" in guide
    assert "PUBLIC_HEALTH_URL=https://api.filfitclub.ru/health" in guide
    assert "pg_dump" in backup
    assert "pg_restore --list" in backup
    assert "--webhook-base" in telegram_sync
    assert "await set_webhook" in telegram_sync

    telegram_setup = (ROOT / "scripts" / "setup_telegram_bot.ps1").read_text(
        encoding="utf-8"
    )
    assert "-MiniAppUrl https://app.filfitclub.ru" in telegram_setup
    assert "-WebhookBase https://api.filfitclub.ru" in telegram_setup
    assert '[string]$WebhookBase = "https://api.filfitclub.ru"' in telegram_setup
    assert '$WebhookUrl = "$WebhookBase/telegram/webhook"' in telegram_setup

    vector_restore = (
        ROOT
        / "supabase"
        / "migrations"
        / "20260823000021_restore_local_embedding_to_vector.sql"
    ).read_text(encoding="utf-8")
    assert "embedding_type = 'double precision[]'" in vector_restore
    assert "ALTER COLUMN embedding TYPE vector(1536)" in vector_restore
    assert "cardinality(embedding) <> 1536" in vector_restore

    local_migrations = (ROOT / "scripts" / "apply_migrations_local.ps1").read_text(
        encoding="utf-8"
    )
    assert 'if ($file.Name -eq "20260823000021_restore_local_embedding_to_vector.sql")' in (
        local_migrations
    )
