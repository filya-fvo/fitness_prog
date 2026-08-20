#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { throw "Project root not found from $PSScriptRoot" }
$BackendDir = Join-Path $Root "backend"
$EnvFile = Join-Path $BackendDir ".env"
$Arq = Join-Path $BackendDir ".venv\Scripts\arq.exe"
$Py = Join-Path $BackendDir ".venv\Scripts\python.exe"
$Guide = Join-Path $Root "NOTIFICATIONS.md"

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    $map[$k] = $v
  }
  return $map
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if (-not $ok) { $c.Close(); return $false }
    $c.EndConnect($iar) | Out-Null
    $c.Close()
    return $true
  } catch { return $false }
}

Write-Host "=== Notifications status ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
$envMap = Read-DotEnv $EnvFile
$url = if ($envMap["REDIS_URL"]) { $envMap["REDIS_URL"] } else { "redis://127.0.0.1:6379/0" }
Write-Host "REDIS_URL: $url"
$hostName = "127.0.0.1"; $port = 6379
if ($url -match "redis://(?:[^@]*@)?([^:/]+)(?::(\d+))?") {
  $hostName = $Matches[1]
  if ($Matches[2]) { $port = [int]$Matches[2] }
  if ($hostName -eq "localhost") { $hostName = "127.0.0.1" }
}
$redisOk = Test-TcpPort $hostName $port
Write-Host ("Redis TCP {0}:{1} = {2}" -f $hostName, $port, $redisOk)
$token = [string]$envMap["BOT_TOKEN"]
$botOk = (-not [string]::IsNullOrWhiteSpace($token) -and -not $token.StartsWith("replace_with"))
Write-Host ("BOT_TOKEN set = {0}" -f $botOk)
Write-Host ("BOT_USERNAME = {0}" -f $envMap["BOT_USERNAME"])
Write-Host ("arq.exe = {0}" -f (Test-Path $Arq))

$workerLines = @()
try {
  $workerLines = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -and $_.CommandLine -and
      ($_.Name -match "python|arq") -and
      ($_.CommandLine -match "WorkerSettings|tasks\.notifications")
    } |
    Select-Object ProcessId, Name)
} catch {}
if ($workerLines.Count -gt 0) {
  Write-Host "Worker process: detected" -ForegroundColor Green
  $workerLines | ForEach-Object { Write-Host ("  PID {0} {1}" -f $_.ProcessId, $_.Name) }
} else {
  $workerLog = Join-Path $Root ("logs\worker-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
  $recentLog = (Test-Path $workerLog) -and (((Get-Date) - (Get-Item $workerLog).LastWriteTime).TotalMinutes -lt 3)
  if ($recentLog) {
    Write-Host "Worker process: active (recent worker log; process details require elevation)" -ForegroundColor Green
  } else {
    Write-Host "Worker process: not detected (run start-notifications.cmd)" -ForegroundColor Yellow
  }
}

if ((Test-Path $Py) -and $redisOk) {
  try {
    $ping = & $Py -c "import redis; print(redis.from_url(r'''$url''').ping())" 2>$null
    Write-Host "Redis PING: $ping"
  } catch {
    Write-Host "Redis PING: (skip)"
  }
}

Write-Host "Guide: $Guide"
Write-Host "RU guide filename in root: UVEDOMLENIYA.md / NOTIFICATIONS.md"
