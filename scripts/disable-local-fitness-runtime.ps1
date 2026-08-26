#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskNames = @("Fitness App Supervisor", "Fitness Local Cleanup")
$PostgresServiceName = "postgresql-x64-18"

function Get-FitnessRuntimeProcesses {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $command = [string]$_.CommandLine
    $executable = [string]$_.ExecutablePath
    ($command -match "fitness-supervisor\.ps1") -or
    ($command -match "WorkerSettings|tasks\.notifications") -or
    ($command -match "uvicorn.+app\.main:app") -or
    ($command -match ([regex]::Escape($Root) + ".*frontend.*vite")) -or
    ($_.Name -eq "redis-server.exe" -and $executable.StartsWith(
      (Join-Path $Root "tools\redis"),
      [StringComparison]::OrdinalIgnoreCase
    ))
  })
}

foreach ($taskName in $TaskNames) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "[OK] Scheduled task is absent: $taskName" -ForegroundColor Green
    continue
  }
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "[OK] Scheduled task removed: $taskName" -ForegroundColor Green
}

foreach ($process in Get-FitnessRuntimeProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] Process stopped: $($process.Name) PID $($process.ProcessId)" -ForegroundColor Green
}

$tailscale = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (Test-Path -LiteralPath $tailscale) {
  & $tailscale funnel reset
  if ($LASTEXITCODE -ne 0) {
    throw "Tailscale Funnel reset failed with exit code $LASTEXITCODE"
  }
  Write-Host "[OK] Tailscale Funnel configuration removed" -ForegroundColor Green
}

$postgres = Get-Service -Name $PostgresServiceName -ErrorAction SilentlyContinue
if ($postgres) {
  if ($postgres.Status -ne "Stopped") {
    Stop-Service -Name $PostgresServiceName -Force
  }
  Set-Service -Name $PostgresServiceName -StartupType Manual
  Write-Host "[OK] $PostgresServiceName stopped; startup type is Manual" -ForegroundColor Green
}

Start-Sleep -Seconds 2
$remainingProcesses = @(Get-FitnessRuntimeProcesses)
$remainingPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
  $_.LocalPort -in 5173, 6379, 8001
})
$remainingTasks = @($TaskNames | Where-Object {
  Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue
})
$postgresAfter = Get-CimInstance Win32_Service -Filter "Name='$PostgresServiceName'" -ErrorAction SilentlyContinue

if ($remainingProcesses.Count -gt 0 -or $remainingTasks.Count -gt 0 -or $remainingPorts.Count -gt 0) {
  throw "Local fitness runtime is still present; inspect processes, tasks and ports 5173/6379/8001"
}
if ($postgresAfter -and ($postgresAfter.State -ne "Stopped" -or $postgresAfter.StartMode -ne "Manual")) {
  throw "$PostgresServiceName did not reach Stopped/Manual state"
}

Write-Host ""
Write-Host "[OK] Local Fitness runtime is disabled permanently." -ForegroundColor Green
Write-Host "VPS production, local database files, project files and Tailscale installation are untouched."

