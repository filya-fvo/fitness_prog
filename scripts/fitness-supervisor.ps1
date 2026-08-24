#Requires -Version 5.1
param(
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { throw "Project root not found from $PSScriptRoot" }

$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "supervisor.log"
$HeartbeatFile = Join-Path $LogDir "supervisor-heartbeat.json"
$RestartApiRequest = Join-Path $LogDir "restart-api.request"
$RestartWorkerRequest = Join-Path $LogDir "restart-worker.request"
$StartAll = Join-Path $Root "scripts\start-all.ps1"
$StartRedis = Join-Path $Root "scripts\start-redis.ps1"
$StartNotifications = Join-Path $Root "scripts\start-notifications.ps1"
$BackendPort = 8001
$PublicPort = $BackendPort
$FailureThreshold = 2

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$SupervisorLockPath = Join-Path $LogDir "fitness-supervisor.lock"
try {
  # A file handle with FileShare.None works across users and Windows sessions.
  # It is released automatically if the supervisor process crashes.
  $SupervisorLock = [System.IO.File]::Open(
    $SupervisorLockPath,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch {
  exit 0
}

function Write-SupervisorLog([string]$Message, [string]$Level = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding utf8
}

function Write-SupervisorHeartbeat(
  [bool]$LocalOk,
  [bool]$RedisOk,
  [bool]$WorkerOk
) {
  $payload = @{
    updated_at_utc = [DateTime]::UtcNow.ToString("o")
    local_ok = $LocalOk
    redis_ok = $RedisOk
    worker_ok = $WorkerOk
  } | ConvertTo-Json -Compress
  Set-Content -LiteralPath $HeartbeatFile -Value $payload -Encoding utf8
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
  $quotedScriptPath = '"{0}"' -f $ScriptPath
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedScriptPath) + $ScriptArguments
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
    Start-HiddenPowerShell $StartAll @("-SkipBuild")
    Start-Sleep -Seconds 15
  }

  if (-not (Test-Tcp 6379)) {
    Write-SupervisorLog "Redis is down; starting portable Redis" "WARN"
    Start-HiddenPowerShell $StartRedis
    Start-Sleep -Seconds 3
  }

  if (-not (Test-NotificationWorker)) {
    Write-SupervisorLog "Notification worker is down; starting it" "WARN"
    Start-HiddenPowerShell $StartNotifications @("-Headless")
  }
}

function Invoke-RequestedApiRestart {
  if (-not (Test-Path -LiteralPath $RestartApiRequest)) { return }
  try {
    $listeners = @(Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
      $command = [string]$process.CommandLine
      if ($command -match [regex]::Escape($Root) -and $command -match "uvicorn") {
        Write-SupervisorLog "Applying requested API restart; pid=$($listener.OwningProcess)"
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
      } else {
        Write-SupervisorLog "API restart request ignored unexpected pid=$($listener.OwningProcess)" "ERROR"
        return
      }
    }
    Remove-Item -LiteralPath $RestartApiRequest -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Ensure-LocalStack
  } catch {
    Write-SupervisorLog "Requested API restart failed: $($_.Exception.Message)" "ERROR"
  }
}

function Invoke-RequestedWorkerRestart {
  if (-not (Test-Path -LiteralPath $RestartWorkerRequest)) { return }
  try {
    $workers = @(
      Get-CimInstance Win32_Process -ErrorAction Stop |
        Where-Object {
          $_.Name -and $_.CommandLine -and
          (
            (
              ($_.Name -match "python|arq") -and
              ($_.CommandLine -match "WorkerSettings|tasks\.notifications")
            ) -or (
              ($_.Name -match "powershell") -and
              ($_.CommandLine -match "notification-worker\.lock") -and
              ($_.CommandLine -match "WorkerSettings|tasks\.notifications")
            )
          )
        }
    )
    foreach ($worker in $workers) {
      if (Get-Process -Id $worker.ProcessId -ErrorAction SilentlyContinue) {
        Write-SupervisorLog "Applying requested worker restart; pid=$($worker.ProcessId)"
        # Stopping the ARQ wrapper can terminate its Python child before this
        # snapshot reaches the next PID; that is a successful restart, not an error.
        Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
    Remove-Item -LiteralPath $RestartWorkerRequest -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Start-HiddenPowerShell $StartNotifications @("-Headless", "-ForceStart")
  } catch {
    Write-SupervisorLog "Requested worker restart failed: $($_.Exception.Message)" "ERROR"
  }
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
$localFailures = 0

# Do not wait for two failed monitoring cycles after boot. The first task start
# must bring up the complete stack immediately on a freshly installed server.
Ensure-LocalStack

while ($true) {
  try {
    Invoke-RequestedApiRestart
    Invoke-RequestedWorkerRestart
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
    $redisOk = Test-Tcp 6379
    $workerOk = Test-NotificationWorker
    if (-not $redisOk -or -not $workerOk) {
      Ensure-LocalStack
    }
    Write-SupervisorHeartbeat $localOk $redisOk $workerOk
  } catch {
    Write-SupervisorLog "Supervisor cycle error: $($_.Exception.Message)" "ERROR"
  }
  Start-Sleep -Seconds ([Math]::Max(15, $IntervalSeconds))
}
