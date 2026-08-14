#Requires -RunAsAdministrator
#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$TaskName = "Fitness App Supervisor"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "[OK] $TaskName removed" -ForegroundColor Green
} else {
  Write-Host "$TaskName is not installed"
}
