#Requires -Version 5.1
#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Stop", "Resume")]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "Fitness App Supervisor"

function Get-ScopedRuntimeProcesses {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $command = [string]$_.CommandLine
    $command -and
    $command.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    (
      $command -match "fitness-supervisor\.ps1" -or
      $command -match "WorkerSettings|tasks\.notifications" -or
      $command -match "uvicorn.+app\.main:app"
    )
  })
}

if ($Mode -eq "Resume") {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { throw "Scheduled task '$TaskName' is not installed" }
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "[OK] Local Supervisor resumed for rollback." -ForegroundColor Green
  Write-Host "Tailscale, PostgreSQL, Redis and local data were never removed."
  exit 0
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
foreach ($process in Get-ScopedRuntimeProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
$remaining = @(Get-ScopedRuntimeProcesses)
$listener = @(Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)
if ($remaining.Count -gt 0 -or $listener.Count -gt 0) {
  throw "Local API/worker is still running; do not start the final database copy"
}

Write-Host "[OK] Local API, notification worker and Supervisor are paused." -ForegroundColor Green
Write-Host "Tailscale, PostgreSQL, Redis, project files and all local data are preserved."
Write-Host "Rollback: run resume-local-after-vps-cutover.cmd"
