#Requires -Version 5.1
# Full local launch: backend + frontend + Tailscale Funnel + Telegram webhook.
# Entry point: <project>\start-all.cmd
param(
  [switch]$SkipTunnel,
  [switch]$SkipNgrok,
  [switch]$SkipTelegram,
  [switch]$SkipBuild,
  [switch]$Development,
  [switch]$Reload
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend"))) { throw "Project root not found from $PSScriptRoot" }

$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$ScriptsDir = Join-Path $Root "scripts"
$BackendPort = 8001
$FrontendPort = 5173
$PublicPort = $BackendPort
$Uvicorn = Join-Path $BackendDir ".venv\Scripts\uvicorn.exe"
$SetupTg = Join-Path $ScriptsDir "setup_telegram_bot.ps1"
$StartTailscale = Join-Path $ScriptsDir "start-tailscale-funnel.ps1"
$UrlsOut = Join-Path $ScriptsDir "tailscale-url.local.env"
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

function Set-DotEnvVal([string]$Path, [string]$Key, [string]$Value) {
  $raw = if (Test-Path -LiteralPath $Path) { Get-Content -LiteralPath $Path -Raw } else { "" }
  if ($raw -match ("(?m)^\s*" + [regex]::Escape($Key) + "\s*=")) {
    $raw = [regex]::Replace(
      $raw,
      ("(?m)^\s*" + [regex]::Escape($Key) + "\s*=.*$"),
      "$Key=$Value"
    )
  } else {
    if ($raw -and -not $raw.EndsWith("`n")) { $raw += "`r`n" }
    $raw += "$Key=$Value`r`n"
  }
  Set-Content -LiteralPath $Path -Value $raw -Encoding utf8
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

if (-not $Development) {
  $distIndex = Join-Path $FrontendDir "dist\index.html"
  if (-not $SkipBuild) {
    Info "Building and safely publishing production frontend..."
    Push-Location $FrontendDir
    try {
      & npm.cmd run build:publish
      if ($LASTEXITCODE -ne 0) { Die "Frontend production publish failed" }
    } finally {
      Pop-Location
    }
    Ok "Production frontend published; previous release assets retained"
  } elseif (-not (Test-Path -LiteralPath $distIndex)) {
    Die "frontend\dist is missing. Run start-all.cmd once without -SkipBuild."
  }

  $backendEnvPath = Join-Path $BackendDir ".env"
  $backendEnv = Read-DotEnv $backendEnvPath
  if (-not [string]$backendEnv["TELEGRAM_WEBHOOK_SECRET"]) {
    $secretBytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
    $webhookSecret = [Convert]::ToBase64String($secretBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    Set-DotEnvVal $backendEnvPath "TELEGRAM_WEBHOOK_SECRET" $webhookSecret
    Ok "Generated TELEGRAM_WEBHOOK_SECRET in backend\.env (value is not printed)"
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
  Stop-Port $BackendPort "backend"
}
Info "Starting backend (uvicorn :$BackendPort)..."
$reloadArg = ""
if ($Development -and $Reload) { $reloadArg = " --reload" }
$be = "Set-Location -LiteralPath '$BackendDir'; & '$Uvicorn' app.main:app --host 127.0.0.1 --port $BackendPort$reloadArg"
Start-PsWindow "BACKEND uvicorn :$BackendPort" $be

if (-not (Wait-Http "http://127.0.0.1:$BackendPort/health" 45)) {
  Die "Backend not ready on http://127.0.0.1:$BackendPort/health - check BACKEND window / DATABASE_URL"
}
Ok "Backend OK  http://127.0.0.1:$BackendPort/health"

# --- frontend ---
if ($Development) {
  if ((Get-ListenPids $FrontendPort).Count -gt 0 -or (Wait-Http "http://127.0.0.1:$FrontendPort" 2)) {
    Ok "Development frontend already on :$FrontendPort"
  } else {
    Info "Starting development frontend (Vite :$FrontendPort)..."
    $fe = "Set-Location -LiteralPath '$FrontendDir'; npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort"
    Start-PsWindow "FRONTEND Vite :$FrontendPort" $fe
  }
  if (-not (Wait-Http "http://127.0.0.1:$FrontendPort" 55)) {
    Warn "Development frontend not answering yet on :$FrontendPort - check FRONTEND window"
  } else {
    Ok "Development frontend OK http://127.0.0.1:$FrontendPort"
  }
} else {
  if ((Get-ListenPids $FrontendPort).Count -gt 0) {
    Stop-Port $FrontendPort "old Vite development server"
  }
  if (-not (Wait-Http "http://127.0.0.1:$PublicPort" 10)) {
    Die "Built frontend is not available through FastAPI on :$PublicPort"
  }
  Ok "Production app OK http://127.0.0.1:$PublicPort"
}

$publicUrl = ""
$skipPublicTunnel = $SkipTunnel -or $SkipNgrok
if ($Development) { $skipPublicTunnel = $true }

# --- public HTTPS through Tailscale Funnel ---
if (-not $skipPublicTunnel) {
  if (-not (Test-Path -LiteralPath $StartTailscale)) {
    Warn "scripts\start-tailscale-funnel.ps1 not found - skip tunnel"
  } else {
    try {
      $saved = Read-DotEnv $UrlsOut
      if ($saved["TUNNEL_PROVIDER"] -eq "tailscale" -and $saved["FRONTEND_PUBLIC_URL"] -like "https://*.ts.net") {
        $publicUrl = [string]$saved["FRONTEND_PUBLIC_URL"]
        Info "Using saved Tailscale Funnel: $publicUrl"
      }
      # A reachable saved URL is not sufficient: it can still point to an old
      # Vite port. Explicitly re-assert the production target on every publish.
      Info "Ensuring Tailscale Funnel target -> :$PublicPort (UAC prompt)..."
      $arguments = @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $StartTailscale,
        "-Port", [string]$PublicPort, "-OutputFile", $UrlsOut
      )
      $funnel = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
      if ($funnel.ExitCode -ne 0) { throw "Funnel setup exited with code $($funnel.ExitCode)" }
      $saved = Read-DotEnv $UrlsOut
      $publicUrl = [string]$saved["FRONTEND_PUBLIC_URL"]
    } catch {
      Warn "Tailscale Funnel not ready: $($_.Exception.Message)"
      Warn "Open Tailscale, log in once, then run start-all.cmd again."
      $publicUrl = ""
    }

    if ($publicUrl -like "https://*") {
      Info "Waiting for public HTTPS readiness..."
      if (-not (Wait-Http $publicUrl 60)) {
        throw "Public Funnel did not become reachable: $publicUrl"
      }
      $publicHealth = "$publicUrl/health"
      if (-not (Wait-Http $publicHealth 30)) {
        throw "Public health endpoint did not become ready: $publicHealth"
      }
      Ok "Public HTTPS ready: $publicUrl"
      $beEnv = Join-Path $BackendDir ".env"
      if (Test-Path -LiteralPath $beEnv) {
        $currentBackendEnv = Read-DotEnv $beEnv
        if ([string]$currentBackendEnv["MINI_APP_URL"] -ne $publicUrl) {
          $raw = Get-Content -LiteralPath $beEnv -Raw
          if ($raw -match "(?m)^\s*MINI_APP_URL\s*=") {
            $raw = [regex]::Replace($raw, "(?m)^\s*MINI_APP_URL\s*=.*$", "MINI_APP_URL=$publicUrl")
          } else {
            if (-not $raw.EndsWith("`n")) { $raw += "`r`n" }
            $raw += "MINI_APP_URL=$publicUrl`r`n"
          }
          Set-Content -LiteralPath $beEnv -Value $raw -Encoding utf8
          Info "Updated backend\.env MINI_APP_URL; restarting backend once..."
          Stop-Port $BackendPort "backend"
          $be2 = "Set-Location -LiteralPath '$BackendDir'; & '$Uvicorn' app.main:app --host 127.0.0.1 --port $BackendPort"
          Start-PsWindow "BACKEND uvicorn :$BackendPort (env reload)" $be2
          if (-not (Wait-Http "http://127.0.0.1:$BackendPort/health" 45)) {
            Die "Backend did not recover after MINI_APP_URL update"
          }
          Ok "Backend reloaded"
        } else {
          Ok "backend\.env MINI_APP_URL already matches Funnel"
        }
      }
    } else {
      Warn "Tailscale HTTPS URL not detected. Local app remains available."
    }
  }
}

# --- telegram ---
if ((-not $SkipTelegram) -and (-not $skipPublicTunnel) -and $publicUrl) {
  if (Test-Path -LiteralPath $SetupTg) {
    Info "Configuring Telegram standard menu + /start webhook..."
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupTg -MiniAppUrl $publicUrl
      if ($LASTEXITCODE -ne 0) { throw "setup_telegram_bot.ps1 exited with code $LASTEXITCODE" }
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
if ($Development) {
  Write-Host "  Dev front   : http://127.0.0.1:$FrontendPort"
  Write-Host "  Local API   : http://127.0.0.1:$BackendPort/docs"
} else {
  Write-Host "  Local app   : http://127.0.0.1:$PublicPort"
  Write-Host "  Health      : http://127.0.0.1:$BackendPort/health"
}
if ($publicUrl) {
  Write-Host "  Telegram URL: $publicUrl" -ForegroundColor Green
  Write-Host "  Tunnel      : Tailscale Funnel (stable HTTPS, no warning page)"
  Write-Host ""
  Write-Host "  Telegram: open @$bot -> /start -> inline Open" -ForegroundColor Green
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
