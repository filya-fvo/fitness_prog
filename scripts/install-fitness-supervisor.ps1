#Requires -RunAsAdministrator
#Requires -Version 5.1
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { $Root = "C:\fitness_prog" }
$Supervisor = Join-Path $Root "scripts\fitness-supervisor.ps1"
$TaskName = "Fitness App Supervisor"

if (-not (Test-Path -LiteralPath $Supervisor)) {
  throw "Supervisor script not found: $Supervisor"
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Supervisor`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $Root
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Keeps Fitness Mini App, Redis, notifications and Tailscale Funnel available." `
  -Force | Out-Null

$tailscale = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (Test-Path -LiteralPath $tailscale) {
  & $tailscale set --unattended=true
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Task installed, but Tailscale Run unattended could not be enabled automatically."
  } else {
    Write-Host "[OK] Tailscale Run unattended enabled" -ForegroundColor Green
  }
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "[OK] $TaskName installed and started. State=$($task.State)" -ForegroundColor Green
Write-Host "Log: $Root\logs\supervisor.log"
