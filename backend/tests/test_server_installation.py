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
