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
        "scripts/apply_migrations_local.ps1",
    )
    for relative in runtime_files:
        text = (ROOT / relative).read_text(encoding="utf-8").lower()
        assert "c:\\fitness_prog" not in text, relative

    supervisor = (ROOT / "scripts" / "fitness-supervisor.ps1").read_text(encoding="utf-8")
    installer = (ROOT / "scripts" / "install-fitness-supervisor.ps1").read_text(encoding="utf-8")
    assert "supervisor-heartbeat.json" in supervisor
    assert "supervisor-install-status.json" in installer

    launcher = (ROOT / "start_all_comand.bat").read_text(encoding="utf-8")
    assert "%~dp0" in launcher
