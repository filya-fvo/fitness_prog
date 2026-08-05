#Requires -Version 5.1
<#
.SYNOPSIS
  Wipe user data in the fitness DB and notify Telegram users who logged in.

.DESCRIPTION
  Thin wrapper around backend/scripts/reset_user_data_and_notify.py

  Keeps catalogs: exercises, programs, nutrition_products.
  Deletes: users, workouts, workout_sets, nutrition_logs, ai_conversations, email_otp_codes.
  Then sends a Telegram message asking to re-register / complete onboarding.

.EXAMPLE
  # Dry-run (default) — show counts and recipients, no changes
  .\reset-user-db.ps1

.EXAMPLE
  # Actually wipe + notify
  .\reset-user-db.ps1 -Execute
#>
[CmdletBinding()]
param(
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }

$Backend = Join-Path $Root "backend"
$PyCandidates = @(
    (Join-Path $Backend ".venv\Scripts\python.exe"),
    (Join-Path $Root ".venv\Scripts\python.exe")
)
$Python = $PyCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Python) {
    Write-Error "Python venv not found. Expected backend\.venv or .venv"
    exit 1
}

$Script = Join-Path $Backend "scripts\reset_user_data_and_notify.py"
if (-not (Test-Path $Script)) {
    Write-Error "Missing $Script"
    exit 1
}

$argsList = @($Script)
if ($Execute) {
    $argsList += "--execute"
    Write-Host "=== EXECUTE: wipe user DB + notify ===" -ForegroundColor Yellow
} else {
    Write-Host "=== DRY-RUN (pass -Execute to apply) ===" -ForegroundColor Cyan
}

Push-Location $Backend
try {
    & $Python @argsList
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
