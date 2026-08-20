#Requires -Version 5.1
# Start portable Redis from tools\redis (no Memurai/MSI needed).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { throw "Project root not found from $PSScriptRoot" }

$RedisDir = Join-Path $Root "tools\redis"
$Server = Join-Path $RedisDir "redis-server.exe"
$Conf = Join-Path $RedisDir "redis.windows.conf"
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
$Installer = Join-Path $Root "scripts\install-redis-portable.py"

function Info([string]$m) { Write-Host "[redis] $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "[redis] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[redis] $m" -ForegroundColor Yellow }
function Die([string]$m) {
  Write-Host "[redis] ERROR: $m" -ForegroundColor Red
  exit 1
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(600)
    if (-not $ok) { $c.Close(); return $false }
    $c.EndConnect($iar) | Out-Null
    $c.Close()
    return $true
  } catch { return $false }
}

Info "Root: $Root"

if (Test-TcpPort "127.0.0.1" 6379) {
  Ok "Redis already listening on 127.0.0.1:6379"
  exit 0
}

if (-not (Test-Path $Server)) {
  Warn "Portable redis-server.exe not found. Downloading..."
  if (-not (Test-Path $Py)) { Die "Python venv not found: $Py" }
  & $Py $Installer
  if ($LASTEXITCODE -ne 0) {
    Die "install-redis-portable.py failed (exit $LASTEXITCODE). Check network/GitHub access."
  }
}

if (-not (Test-Path $Server)) {
  Die "Still no redis-server.exe at $Server"
}

if (-not (Test-Path $Conf)) {
  @"
bind 127.0.0.1
port 6379
protected-mode yes
save ""
appendonly no
"@ | Set-Content -LiteralPath $Conf -Encoding ascii
}

Info "Starting portable Redis window..."
$cmd = @"
Set-Location '$RedisDir'
`$Host.UI.RawUI.WindowTitle = 'FITNESS REDIS'
Write-Host '========================================' -ForegroundColor Green
Write-Host '  FITNESS portable Redis (127.0.0.1:6379)' -ForegroundColor Green
Write-Host '  Stop: Ctrl+C or close window' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
& '$Server' '$Conf'
Write-Host ''
Write-Host 'Redis stopped. Press any key...' -ForegroundColor Yellow
[void][System.Console]::ReadKey(`$true)
"@

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd
) | Out-Null

# wait up to ~8s
for ($i = 0; $i -lt 16; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-TcpPort "127.0.0.1" 6379) {
    Ok "Redis is up on 127.0.0.1:6379"
    exit 0
  }
}

Warn "Redis window started, but port 6379 not open yet. Check the REDIS window for errors."
exit 0
