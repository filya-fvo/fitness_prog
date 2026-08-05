#Requires -Version 5.1
# Full local launch: backend + frontend + ngrok + Telegram Open button.
# Entry point: C:\fitness_prog\start-all.cmd
param(
  [switch]$SkipNgrok,
  [switch]$SkipTelegram,
  [switch]$Reload
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) {
  $Root = "C:\fitness_prog"
}

$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$ScriptsDir = Join-Path $Root "scripts"
$BackendPort = 8001
$FrontendPort = 5173
$Uvicorn = Join-Path $BackendDir ".venv\Scripts\uvicorn.exe"
$SetupTg = Join-Path $ScriptsDir "setup_telegram_bot.ps1"
$NgrokYml = Join-Path $ScriptsDir "ngrok.yml"
$NgrokYmlExample = Join-Path $ScriptsDir "ngrok.yml.example"
$UrlsOut = Join-Path $ScriptsDir "ngrok-urls.local.env"
$DevPs1 = Join-Path $ScriptsDir "dev.ps1"

function Info([string]$m) { Write-Host "[start-all] $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "[start-all] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[start-all] $m" -ForegroundColor Yellow }
function Die([string]$m) {
  Write-Host "[start-all] ERROR: $m" -ForegroundColor Red
  exit 1
}

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -LiteralPath $Path | ForEach-Object {
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

function Get-EnvVal([string]$Key) {
  $fromProcess = [Environment]::GetEnvironmentVariable($Key, "Process")
  if ($fromProcess) { return $fromProcess }
  foreach ($p in @((Join-Path $Root ".env"), (Join-Path $BackendDir ".env"))) {
    $m = Read-DotEnv $p
    if ($m.ContainsKey($Key) -and $m[$Key]) { return [string]$m[$Key] }
  }
  return ""
}

function Get-ListenPids([int]$Port) {
  $list = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  return @($list | Where-Object { $_ -ne $null })
}

function Stop-Port([int]$Port, [string]$Label) {
  foreach ($procId in (Get-ListenPids $Port)) {
    Warn "Stopping $Label PID $procId on :$Port"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
}

function Wait-Http([string]$Url, [int]$TimeoutSec = 40) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-NgrokHttps([int]$TimeoutSec = 50) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
      foreach ($tunnel in @($t.tunnels)) {
        if ($tunnel.public_url -like "https://*") {
          return [string]$tunnel.public_url
        }
      }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return ""
}

function Ensure-NgrokConfig {
  if (-not (Test-Path -LiteralPath $NgrokYml)) {
    if (Test-Path -LiteralPath $NgrokYmlExample) {
      Copy-Item -LiteralPath $NgrokYmlExample -Destination $NgrokYml -Force
      Info "Created scripts\ngrok.yml from example"
    } else {
      $content = @(
        'version: "2"'
        "tunnels:"
        "  frontend:"
        "    addr: 5173"
        "    proto: http"
      ) -join "`r`n"
      Set-Content -LiteralPath $NgrokYml -Value $content -Encoding ascii
    }
  }
  $raw = Get-Content -LiteralPath $NgrokYml -Raw
  if ($raw -match "(?m)^\s*authtoken\s*:") {
    $raw2 = [regex]::Replace($raw, "(?m)^\s*authtoken\s*:.*(\r?\n)?", "")
    Set-Content -LiteralPath $NgrokYml -Value $raw2 -Encoding ascii
    Warn "Removed authtoken from ngrok.yml (use NGROK_AUTHTOKEN in .env)"
  }
}

function Start-PsWindow([string]$Title, [string]$Command) {
  $full = "Write-Host '=== $Title ===' -ForegroundColor Green; $Command"
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-Command",
    $full
  ) | Out-Null
}

# --- preflight ---
Info "Root: $Root"
if (-not (Test-Path -LiteralPath $Uvicorn)) {
  Die "Backend venv/uvicorn missing. Once: cd backend; python -m venv .venv; .\.venv\Scripts\pip install -e `".[dev]`""
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "package.json"))) {
  Die "frontend\package.json not found"
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
  Warn "frontend\node_modules missing - running npm.cmd install..."
  Push-Location $FrontendDir
  try {
    cmd /c "npm.cmd install"
    if ($LASTEXITCODE -ne 0) { Die "npm install failed" }
  } finally {
    Pop-Location
  }
}

$dbUrl = Get-EnvVal "DATABASE_URL"
if ($dbUrl -and $dbUrl -match "localhost") {
  Warn "DATABASE_URL uses localhost - on Windows prefer 127.0.0.1"
}

# --- backend import preflight (fail fast on SyntaxError) ---
$PyExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (Test-Path -LiteralPath $PyExe) {
  Info "Checking backend import..."
  Push-Location $BackendDir
  try {
    & $PyExe -c "import app.main"
    if ($LASTEXITCODE -ne 0) {
      Die "Backend import failed (app.main). Fix SyntaxError in backend, then retry."
    }
  } catch {
    Die "Backend import failed: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
  Ok "Backend import OK"
}

# --- backend ---
if ((Get-ListenPids $BackendPort).Count -gt 0) {
  Ok "Backend already on :$BackendPort"
} else {
  Info "Starting backend (uvicorn :$BackendPort)..."
  $reloadArg = ""
  if ($Reload) { $reloadArg = " --reload" }
  $be = "Set-Location -LiteralPath '$BackendDir'; & '$Uvicorn' app.main:app --host 127.0.0.1 --port $BackendPort$reloadArg"
  Start-PsWindow "BACKEND uvicorn :$BackendPort" $be
}

if (-not (Wait-Http "http://127.0.0.1:$BackendPort/docs" 45)) {
  Die "Backend not ready on http://127.0.0.1:$BackendPort/docs - check BACKEND window / DATABASE_URL"
}
Ok "Backend OK  http://127.0.0.1:$BackendPort/docs"

# --- frontend ---
if ((Get-ListenPids $FrontendPort).Count -gt 0) {
  Ok "Frontend already on :$FrontendPort"
} else {
  Info "Starting frontend (Vite :$FrontendPort)..."
  $fe = "Set-Location -LiteralPath '$FrontendDir'; npm.cmd run dev -- --host 0.0.0.0 --port $FrontendPort"
  Start-PsWindow "FRONTEND Vite :$FrontendPort" $fe
}

if (-not (Wait-Http "http://127.0.0.1:$FrontendPort" 55)) {
  Warn "Frontend not answering yet on :$FrontendPort - check FRONTEND window"
} else {
  Ok "Frontend OK http://127.0.0.1:$FrontendPort"
}

$publicUrl = ""

# --- ngrok ---
if (-not $SkipNgrok) {
  $ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
  if (-not $ngrokCmd) {
    Warn "ngrok not in PATH - skip tunnel. Browser: http://127.0.0.1:$FrontendPort"
  } else {
    Ensure-NgrokConfig
    $token = Get-EnvVal "NGROK_AUTHTOKEN"
    if (-not $token) {
      Warn "NGROK_AUTHTOKEN empty in .env - ngrok may fail if not already logged in"
    }

    try {
      $existing = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
      foreach ($tunnel in @($existing.tunnels)) {
        if ($tunnel.public_url -like "https://*") {
          $publicUrl = [string]$tunnel.public_url
          break
        }
      }
    } catch {
      $publicUrl = ""
    }

    if (-not $publicUrl) {
      Info "Starting ngrok -> :$FrontendPort ..."
      $tokenEsc = $token -replace "'", "''"
      $ng = @(
        "`$env:NGROK_AUTHTOKEN = '$tokenEsc'"
        "if (`$env:NGROK_AUTHTOKEN) { ngrok config add-authtoken `$env:NGROK_AUTHTOKEN 2>`$null | Out-Null }"
        "ngrok start --config '$NgrokYml' frontend"
      ) -join "; "
      Start-PsWindow "NGROK frontend :$FrontendPort" $ng
      $publicUrl = Wait-NgrokHttps 55
    }

    if ($publicUrl) {
      Ok "Public HTTPS: $publicUrl"
      $stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
      $urlText = @(
        "FRONTEND_PUBLIC_URL=$publicUrl"
        "BACKEND_PUBLIC_URL=$publicUrl"
        "VITE_API_URL="
        "UpdatedAt=$stamp"
      ) -join "`r`n"
      Set-Content -LiteralPath $UrlsOut -Value $urlText -Encoding utf8

      $beEnv = Join-Path $BackendDir ".env"
      if (Test-Path -LiteralPath $beEnv) {
        $raw = Get-Content -LiteralPath $beEnv -Raw
        if ($raw -match "(?m)^\s*MINI_APP_URL\s*=") {
          $raw = [regex]::Replace($raw, "(?m)^\s*MINI_APP_URL\s*=.*$", "MINI_APP_URL=$publicUrl")
        } else {
          if (-not $raw.EndsWith("`n")) { $raw += "`r`n" }
          $raw += "MINI_APP_URL=$publicUrl`r`n"
        }
        Set-Content -LiteralPath $beEnv -Value $raw -Encoding utf8
        Info "Updated backend\.env MINI_APP_URL"

        Info "Restarting backend to load MINI_APP_URL..."
        Stop-Port $BackendPort "backend"
        $be2 = "Set-Location -LiteralPath '$BackendDir'; & '$Uvicorn' app.main:app --host 127.0.0.1 --port $BackendPort"
        Start-PsWindow "BACKEND uvicorn :$BackendPort (env reload)" $be2
        if (-not (Wait-Http "http://127.0.0.1:$BackendPort/docs" 45)) {
          Warn "Backend restart slow - check BACKEND window"
        } else {
          Ok "Backend reloaded"
        }
      }
    } else {
      Warn "ngrok HTTPS URL not detected. Open http://127.0.0.1:4040"
    }
  }
}

# --- telegram ---
if ((-not $SkipTelegram) -and (-not $SkipNgrok) -and $publicUrl) {
  if (Test-Path -LiteralPath $SetupTg) {
    Info "Configuring Telegram Menu Button Open + /start webhook..."
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupTg -MiniAppUrl $publicUrl
      Ok "Telegram setup done"
    } catch {
      Warn "Telegram setup failed: $($_.Exception.Message)"
      Warn "Retry later: scripts\setup_telegram_bot.ps1"
    }
  }
}

# --- summary ---
$bot = Get-EnvVal "BOT_USERNAME"
if (-not $bot) { $bot = "your_bot" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  fitness_prog is running" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Local front : http://127.0.0.1:$FrontendPort"
Write-Host "  Local API   : http://127.0.0.1:$BackendPort/docs"
if ($publicUrl) {
  Write-Host "  Telegram URL: $publicUrl" -ForegroundColor Green
  Write-Host "  ngrok UI    : http://127.0.0.1:4040"
  Write-Host ""
  Write-Host "  Telegram: open @$bot -> /start -> Open" -ForegroundColor Green
} else {
  Write-Host "  Browser only (no public tunnel)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Status : $Root\status.cmd"
Write-Host "  Stop   : $Root\stop-all.cmd"
Write-Host "  Docs   : $Root\RUN.md"
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

if (Test-Path -LiteralPath $DevPs1) {
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DevPs1 status
  } catch { }
}
