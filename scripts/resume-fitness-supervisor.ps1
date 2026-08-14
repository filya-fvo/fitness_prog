#Requires -RunAsAdministrator
#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$TaskName = "Fitness App Supervisor"
Enable-ScheduledTask -TaskName $TaskName | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "[OK] $TaskName resumed. State=$($task.State)" -ForegroundColor Green
