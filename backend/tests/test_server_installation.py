"""Static guarantees for the one-command Windows server installation flow."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_server_installer_covers_required_stack() -> None:
    launcher = (ROOT / "install-server.cmd").read_text(encoding="utf-8")
    installer = (ROOT / "scripts" / "install-server.ps1").read_text(encoding="utf-8")

    assert "scripts\\install-server.ps1" in launcher
    for marker in (
        "python312",
        "nodejs-lts",
        "postgresql18",
        "tailscale",
        "install-redis-portable.py",
        "apply_migrations_local.ps1",
        "seed_prod_content.py",
        "seed_nutrition.py",
        "setup_telegram_bot.ps1",
        "-DryRun",
    ):
        assert marker in installer


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


def test_public_health_monitor_tolerates_a_short_funnel_reconnect() -> None:
    workflow = (ROOT / ".github" / "workflows" / "public-health-monitor.yml").read_text(
        encoding="utf-8"
    )

    assert "for attempt in $(seq 1 6)" in workflow
    assert "sleep 15" in workflow
    assert 'exit "$last_status"' in workflow

    funnel = (ROOT / "scripts" / "start-tailscale-funnel.ps1").read_text(encoding="utf-8")
    assert '$status.BackendState -eq "NeedsLogin"' in funnel
    assert "Tailscale update is incomplete" in funnel
    assert "Restart-Service Tailscale" in funnel


def test_vps_compose_keeps_data_services_private_and_runs_migrations() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "pgvector/pgvector:0.8.6-pg18-bookworm" in compose
    assert "pgdata:/var/lib/postgresql\n" in compose
    assert "pgdata:/var/lib/postgresql/data" not in compose
    assert "./supabase/migrations:/migrations:ro" in compose
    assert "./scripts/apply_migrations_vps.sh:/apply-migrations.sh:ro" in compose
    assert "/bin/sh /apply-migrations.sh" in compose
    assert "condition: service_completed_successfully" in compose
    api_section = compose.split("  api:\n", 1)[1].split("\n  llm:\n", 1)[0]
    worker_section = compose.split("  worker:\n", 1)[1].split("\n  web:\n", 1)[0]
    assert "- ipv6_egress" in api_section
    assert "- ipv6_egress" in worker_section
    assert "- ai_internal" in worker_section
    assert "  ipv6_egress:\n    enable_ipv6: true" in compose
    assert "fd42:9b7a:6d31:2::/64" in compose
    assert "healthcheck:" in worker_section
    assert "disable: true" in worker_section
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

    ipv6_sysctl = (
        ROOT / "deploy" / "timeweb" / "99-fitness-docker-ipv6.conf"
    ).read_text(encoding="utf-8")
    assert "net.ipv6.conf.all.forwarding = 1" in ipv6_sysctl
    assert "net.ipv6.conf.eth0.accept_ra = 2" in ipv6_sysctl

    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "docker compose --env-file backend/.env.production config --quiet" in ci
    assert "Test production migrations and Windows fallback restore" in ci
    assert "ALTER TABLE exercises ADD COLUMN embedding double precision[]" in ci
    assert 'test "$actual" = "vector(1536)"' in ci
    assert "docker build -f backend/Dockerfile -t fitness-api:ci ." in ci
    assert "-t fitness-web:ci ./frontend" in ci


def test_vps_migration_runner_tracks_applied_files_and_repairs_legacy_weight_state() -> None:
    runner = (ROOT / "scripts" / "apply_migrations_vps.sh").read_text(encoding="utf-8")

    assert "fitness_schema_migrations" in runner
    assert "20260823000021_restore_local_embedding_to_vector.sql" in runner
    assert "--single-transaction" in runner
    assert "RECORD_ALREADY_APPLIED" in runner
    assert "! column_exists daily_metrics weight_kg" in runner
    assert "column_exists body_measurements weight_kg" in runner


def test_vps_images_and_production_env_cover_runtime_requirements() -> None:
    backend_dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_entrypoint = (
        ROOT / "frontend" / "docker-entrypoint.d" / "40-publish-release.sh"
    ).read_text(encoding="utf-8")
    production_env = (ROOT / "backend" / ".env.production.example").read_text(
        encoding="utf-8"
    )

    assert "COPY backend/scripts ./scripts" in backend_dockerfile
    assert "COPY docs/USER_GUIDE.md docs/LOCAL_ADMIN_GUIDE.md /docs/" in backend_dockerfile
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


def test_vps_runbook_requires_backup_and_safe_volume_handling() -> None:
    guide = (ROOT / "docs" / "VPS_DEPLOYMENT_GUIDE.md").read_text(encoding="utf-8")
    backup = (ROOT / "scripts" / "backup_vps.sh").read_text(encoding="utf-8")
    telegram_sync = (ROOT / "backend" / "scripts" / "sync_telegram_entrypoints.py").read_text(
        encoding="utf-8"
    )

    assert "sh scripts/backup_vps.sh" in guide
    assert "Никогда не выполняйте `docker compose down -v`" in guide
    assert "--webhook-base https://api.example.ru" in guide
    assert "PUBLIC_HEALTH_URL=https://api.example.ru/health" in guide
    assert "pg_dump" in backup
    assert "pg_restore --list" in backup
    assert "--webhook-base" in telegram_sync
    assert "await set_webhook" in telegram_sync
    assert "--announce-vps-cutover" in telegram_sync
    assert "--preserve-menu-button" in telegram_sync
    assert "select(User.telegram_id).distinct()" in telegram_sync

    telegram_setup = (ROOT / "scripts" / "setup_telegram_bot.ps1").read_text(
        encoding="utf-8"
    )
    assert "SkipPersistMiniAppUrl" in telegram_setup
    assert "(-not $SkipPersistMiniAppUrl)" in telegram_setup
    assert "UpdateWebAppMenu" in telegram_setup
    assert 'type = "web_app"' in telegram_setup
    assert 'web_app = @{ url = $MiniAppUrl }' in telegram_setup
    assert "Existing manual web_app/Menu Button was preserved" in telegram_setup

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


def test_timeweb_vps_bootstrap_and_restore_have_safety_guards() -> None:
    provision = (ROOT / "scripts" / "provision_timeweb_vps.sh").read_text(
        encoding="utf-8"
    )
    restore = (ROOT / "scripts" / "restore-timeweb-postgres.sh").read_text(
        encoding="utf-8"
    )
    replace = (ROOT / "scripts" / "replace-timeweb-postgres.sh").read_text(
        encoding="utf-8"
    )
    backup_timer = (ROOT / "scripts" / "install-vps-backup-timer.sh").read_text(
        encoding="utf-8"
    )
    prepare_env = (ROOT / "scripts" / "prepare-vps-env.ps1").read_text(
        encoding="utf-8"
    )

    assert "https://dockerhub.timeweb.cloud" in provision
    assert "ufw default deny incoming" in provision
    assert "Refusing to restore" in restore
    assert "--exit-on-error" in restore
    assert "--no-owner" in restore
    assert "--clean" not in restore
    assert "backup_vps.sh" in replace
    assert "SHA256 mismatch" in replace
    assert "stop worker api web caddy" in replace
    assert "dropdb" in replace
    assert "restore-timeweb-postgres.sh" in replace
    assert "FINAL_DATABASE_RESTORE_OK" in replace
    assert "/opt/fitness/backups/*" in backup_timer
    assert "Persistent=true" in backup_timer
    assert "fitness-backup.service" in backup_timer
    assert "systemctl enable --now fitness-backup.timer" in backup_timer
    assert "without printing values" in prepare_env
    assert 'EMAIL_OTP_DEV_RETURN_CODE = "false"' in prepare_env

    cutover = (ROOT / "scripts" / "set-local-vps-cutover.ps1").read_text(
        encoding="utf-8"
    )
    assert "#Requires -RunAsAdministrator" in cutover
    assert 'ValidateSet("Stop", "Resume")' in cutover
    assert 'TaskName = "Fitness App Supervisor"' in cutover
    assert "LocalPort 8001" in cutover
    for preserved_service in ("Tailscale", "PostgreSQL", "Redis"):
        assert preserved_service in cutover
