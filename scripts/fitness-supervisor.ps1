#Requires -Version 5.1
param(
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { $Root = "C:\fitness_prog" }

$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "supervisor.log"
$StartAll = Join-Path $Root "scripts\start-all.ps1"
$StartRedis = Join-Path $Root "scripts\start-redis.ps1"
$StartNotifications = Join-Path $Root "scripts\start-notifications.ps1"
$Tailscale = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
$UrlsFile = Join-Path $Root "scripts\tailscale-url.local.env"
$BackendEnv = Join-Path $Root "backend\.env"
$BackendPort = 8001
$PublicPort = $BackendPort
$FailureThreshold = 2

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-SupervisorLog([string]$Message, [string]$Level = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding utf8
}

function Read-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  $line = Get-Content -LiteralPath $Path -Encoding utf8 |
    Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } |
    Select-Object -First 1
  if (-not $line) { return "" }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

function Test-Http([string]$Url, [int]$TimeoutSeconds = 8) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-Tcp([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $result.AsyncWaitHandle.WaitOne(800)
    if ($connected) { $client.EndConnect($result) | Out-Null }
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Start-HiddenPowerShell([string]$ScriptPath, [string[]]$ScriptArguments = @()) {
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $ScriptArguments
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    $arguments
  ) | Out-Null
}

function Test-NotificationWorker {
  try {
    $running = @(
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
          $_.Name -and $_.CommandLine -and
          ($_.Name -match "python|arq") -and
          ($_.CommandLine -match "WorkerSettings|tasks\.notifications")
        }
    ).Count -gt 0
    if ($running) { return $true }
  } catch { }
  $workerLog = Join-Path $Root ("logs\worker-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
  return (Test-Path $workerLog) -and (((Get-Date) - (Get-Item $workerLog).LastWriteTime).TotalMinutes -lt 2)
}

function Ensure-LocalStack {
  $backendOk = Test-Http "http://127.0.0.1:$BackendPort/health" 3
  $frontendOk = Test-Http "http://127.0.0.1:$PublicPort" 3
  if (-not $backendOk -or -not $frontendOk) {
    Write-SupervisorLog "Local production app unhealthy (health=$backendOk frontend=$frontendOk); starting API/UI" "WARN"
    Start-HiddenPowerShell $StartAll @("-SkipTunnel", "-SkipTelegram", "-SkipBuild")
    Start-Sleep -Seconds 15
  }

  if (-not (Test-Tcp 6379)) {
    Write-SupervisorLog "Redis is down; starting portable Redis" "WARN"
    Start-HiddenPowerShell $StartRedis
    Start-Sleep -Seconds 3
  }

  if (-not (Test-NotificationWorker)) {
    Write-SupervisorLog "Notification worker is down; starting it" "WARN"
    Start-HiddenPowerShell $StartNotifications
  }
}

function Ensure-Tailscale {
  if (-not (Test-Path -LiteralPath $Tailscale)) {
    Write-SupervisorLog "Tailscale executable not found" "ERROR"
    return $false
  }
  try {
    $status = (& $Tailscale status --json 2>$null | Out-String | ConvertFrom-Json)
    if ($status.BackendState -ne "Running" -or -not $status.Self.Online) {
      Write-SupervisorLog "Tailscale offline; restarting service" "WARN"
      Restart-Service -Name Tailscale -Force -ErrorAction Stop
      Start-Sleep -Seconds 5
      & $Tailscale up --timeout=20s 2>&1 | Out-Null
    }
    & $Tailscale set --unattended=true 2>&1 | Out-Null
    & $Tailscale funnel --bg $PublicPort 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    Write-SupervisorLog "Tailscale recovery failed: $($_.Exception.Message)" "ERROR"
    return $false
  }
}

function Get-PublicUrl {
  $url = Read-DotEnvValue $UrlsFile "FRONTEND_PUBLIC_URL"
  if (-not $url) { $url = Read-DotEnvValue $BackendEnv "MINI_APP_URL" }
  return $url.Trim().TrimEnd("/")
}

function Prevent-SystemSleep {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FitnessPowerRequest {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@ -ErrorAction SilentlyContinue
  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED. The display may turn off normally.
  [void][FitnessPowerRequest]::SetThreadExecutionState(0x80000001)
}

Prevent-SystemSleep
Write-SupervisorLog "Supervisor started; interval=${IntervalSeconds}s"
$publicFailures = 0
$localFailures = 0

while ($true) {
  try {
    $localOk = (Test-Http "http://127.0.0.1:$BackendPort/health" 3) -and (Test-Http "http://127.0.0.1:$PublicPort" 3)
    if ($localOk) {
      $localFailures = 0
    } else {
      $localFailures++
      Write-SupervisorLog "Local health failed ($localFailures/$FailureThreshold)" "WARN"
      if ($localFailures -ge $FailureThreshold) {
        Ensure-LocalStack
        $localFailures = 0
      }
    }
    if (-not (Test-Tcp 6379) -or -not (Test-NotificationWorker)) {
      Ensure-LocalStack
    }
    $publicUrl = Get-PublicUrl
    $publicOk = $publicUrl.StartsWith("https://") -and (Test-Http "$publicUrl/health" 12)
    if ($publicOk) {
      if ($publicFailures -gt 0) { Write-SupervisorLog "Public endpoint recovered: $publicUrl" }
      $publicFailures = 0
    } else {
      $publicFailures++
      Write-SupervisorLog "Public health failed ($publicFailures/$FailureThreshold): $publicUrl" "WARN"
      if ($publicFailures -ge $FailureThreshold) {
        [void](Ensure-Tailscale)
        Start-Sleep -Seconds 8
        if ($publicUrl -and (Test-Http "$publicUrl/health" 12)) {
          Write-SupervisorLog "Public endpoint recovered after Tailscale/Funnel repair"
          $publicFailures = 0
        }
      }
    }
  } catch {
    Write-SupervisorLog "Supervisor cycle error: $($_.Exception.Message)" "ERROR"
  }
  Start-Sleep -Seconds ([Math]::Max(15, $IntervalSeconds))
}
