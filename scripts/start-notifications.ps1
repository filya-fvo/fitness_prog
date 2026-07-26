#Requires -Version 5.1
param(
  [switch]$SkipRedisCheck,
  [switch]$InstallRedisHint
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { $Root = "C:\fitness_prog" }

$BackendDir = Join-Path $Root "backend"
$Arq = Join-Path $BackendDir ".venv\Scripts\arq.exe"
$Py = Join-Path $BackendDir ".venv\Scripts\python.exe"
$EnvFile = Join-Path $BackendDir ".env"
$GuideRu = Join-Path $Root "NOTIFICATIONS.md"

function Info([string]$m) { Write-Host "[notifications] $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "[notifications] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[notifications] $m" -ForegroundColor Yellow }
function Die([string]$m) {
  Write-Host "[notifications] ERROR: $m" -ForegroundColor Red
  exit 1
}

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
    if ($v -match "^(.*?)(\s+#.*)$") { $v = $Matches[1].Trim() }
    $map[$k] = $v
  }
  return $map
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-RedisEndpoint {
  $envMap = Read-DotEnv $EnvFile
  $url = $envMap["REDIS_URL"]
  if (-not $url) { $url = "redis://127.0.0.1:6379/0" }
  if ($url -match "redis://(?:[^@]*@)?([^:/]+)(?::(\d+))?") {
    $hostName = $Matches[1]
    $port = if ($Matches[2]) { [int]$Matches[2] } else { 6379 }
    if ($hostName -eq "localhost") { $hostName = "127.0.0.1" }
    return @{ Url = $url; Host = $hostName; Port = $port }
  }
  return @{ Url = $url; Host = "127.0.0.1"; Port = 6379 }
}

Info "Root: $Root"

if (-not (Test-Path $Arq)) {
  Die "arq not found: $Arq. Install backend deps first."
}

$envMap = Read-DotEnv $EnvFile
$token = [string]$envMap["BOT_TOKEN"]
if (-not $token -or $token.StartsWith("replace_with")) {
  Warn "BOT_TOKEN missing/placeholder in backend\.env"
} else {
  Ok "BOT_TOKEN is set"
}
$botUser = [string]$envMap["BOT_USERNAME"]
if ($botUser) { Ok "BOT_USERNAME=$botUser" }

$redis = Get-RedisEndpoint
Info "REDIS_URL=$($redis.Url)"

if (-not $SkipRedisCheck) {
  if (Test-TcpPort $redis.Host $redis.Port) {
    Ok "Redis reachable at $($redis.Host):$($redis.Port)"
  } else {
    Warn "Redis NOT reachable at $($redis.Host):$($redis.Port)"
    # Prefer portable Redis in tools\redis (no admin / no Memurai MSI)
    $startRedis = Join-Path $Root "scripts\start-redis.ps1"
    if (Test-Path $startRedis) {
      Info "Trying portable Redis (tools\redis) via start-redis.ps1 ..."
      try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startRedis
      } catch {
        Warn "start-redis.ps1 error: $_"
      }
    }
    if (Test-TcpPort $redis.Host $redis.Port) {
      Ok "Redis reachable after portable start"
    } else {
      Write-Host ""
      Write-Host "Redis still down. Do this:" -ForegroundColor Yellow
      Write-Host "  1) Double-click: start-redis.cmd" -ForegroundColor White
      Write-Host "  2) Or install Memurai AS ADMIN (MSI 1603 = no rights/temp):" -ForegroundColor White
      Write-Host "       right-click Terminal -> Run as administrator" -ForegroundColor White
      Write-Host "       winget install -e --id Memurai.MemuraiDeveloper" -ForegroundColor White
      Write-Host "  3) Or Upstash cloud URL in backend\.env REDIS_URL=..." -ForegroundColor White
      Write-Host ""
      Write-Host "Guide: $GuideRu"
      if ($InstallRedisHint) {
        Info "Trying winget Memurai (may need admin)..."
        winget install -e --id Memurai.MemuraiDeveloper --accept-package-agreements --accept-source-agreements
      }
      Die "Redis is required for ARQ notification worker."
    }
  }
}

if (Test-Path $Py) {
  try {
    $ping = & $Py -c "import redis; r=redis.from_url(r'''$($redis.Url)'''); print(r.ping())" 2>$null
    if ("$ping" -match "True") { Ok "Redis PING=True" }
  } catch { }
}

Info "Starting ARQ worker window..."
$cmd = @"
Set-Location '$BackendDir'
`$Host.UI.RawUI.WindowTitle = 'FITNESS NOTIFICATIONS (ARQ)'
Write-Host '========================================' -ForegroundColor Green
Write-Host '  FITNESS notification worker (ARQ)' -ForegroundColor Green
Write-Host '  Cron: every minute' -ForegroundColor Green
Write-Host '  Stop: Ctrl+C or close window' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
& '$Arq' app.tasks.notifications.WorkerSettings
Write-Host ''
Write-Host 'Worker stopped. Press any key...' -ForegroundColor Yellow
[void][System.Console]::ReadKey(`$true)
"@

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd
) | Out-Null

Ok "Worker window started."
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1) Backend running (start-all.cmd)"
Write-Host "  2) Mini App: Profile -> Notifications -> Save"
Write-Host "  3) User pressed /start in bot chat"
Write-Host "  4) Guide: $GuideRu"