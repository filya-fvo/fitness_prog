#Requires -RunAsAdministrator
#Requires -Version 5.1
param()

$ErrorActionPreference = "Stop"
$Root = (Split-Path -Parent $PSScriptRoot).TrimEnd("\")
$listeners = @(Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) {
  Write-Host "[OK] API is already stopped; supervisor will start it." -ForegroundColor Green
  exit 0
}

foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  $command = [string]$process.CommandLine
  if ($command -notmatch [regex]::Escape($Root) -or $command -notmatch "uvicorn") {
    throw "Refusing to stop unexpected listener on port 8001: PID=$($listener.OwningProcess)"
  }
  Write-Host "Stopping Fitness API PID=$($listener.OwningProcess)..."
  Stop-Process -Id $listener.OwningProcess -Force
}

Write-Host "[OK] API stopped. Fitness App Supervisor will restore it." -ForegroundColor Green
