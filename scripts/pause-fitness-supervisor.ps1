#Requires -RunAsAdministrator
#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$TaskName = "Fitness App Supervisor"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Disable-ScheduledTask -TaskName $TaskName | Out-Null
Write-Host "[OK] $TaskName paused. Services can now be stopped for maintenance." -ForegroundColor Yellow
