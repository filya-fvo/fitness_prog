#Requires -RunAsAdministrator
#Requires -Version 5.1

$TaskName = "Fitness App Supervisor"
$Root = Split-Path -Parent $PSScriptRoot
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Task: $($task.State)  LastResult=$($info.LastTaskResult)  LastRun=$($info.LastRunTime)" -ForegroundColor Cyan
} else {
  Write-Host "$TaskName is not installed" -ForegroundColor Yellow
}
$log = Join-Path $Root "logs\supervisor.log"
if (Test-Path $log) {
  Write-Host ""
  Write-Host "Recent supervisor log:" -ForegroundColor Cyan
  Get-Content $log -Tail 20
}
