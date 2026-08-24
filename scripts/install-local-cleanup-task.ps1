#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$TaskName = "Fitness Local Cleanup",
    [ValidateRange(1, 3650)]
    [int]$OlderThanDays = 2,
    [datetime]$At = "03:20"
)

$ErrorActionPreference = "Stop"
$cleanupScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "cleanup-local.ps1"))
if (-not (Test-Path -LiteralPath $cleanupScript -PathType Leaf)) {
    throw "Cleanup script was not found: $cleanupScript"
}

$powerShell = Join-Path $PSHOME "powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$cleanupScript`" -Apply -OlderThanDays $OlderThanDays"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description "Remove replaceable Fitness project caches and logs older than $OlderThanDays days." `
    -Force | Out-Null

Write-Host "Scheduled task '$TaskName' installed. It does not use -Deep."
Write-Host "Next run: $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
