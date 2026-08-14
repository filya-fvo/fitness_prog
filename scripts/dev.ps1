#Requires -Version 5.1
<#
.SYNOPSIS
  Local dev helpers for fitness_prog (backend / frontend / Tailscale Funnel).

.DESCRIPTION
  Dot-source once per terminal, then call functions:

    Set-ExecutionPolicy -Scope Process Bypass -Force
    . C:\fitness_prog\scripts\dev.ps1
    Start-FitnessStack
    Restart-Backend
    Get-FitnessStatus

  Or use the cmd wrapper (bypasses ExecutionPolicy):

    C:\fitness_prog\scripts\dev.cmd status
    C:\fitness_prog\scripts\dev.cmd restart-backend

.NOTES
  Ports: production app/API 8001, development Vite 5173
  Windows: use 127.0.0.1 in DATABASE_URL (not localhost)
  npm: use npm.cmd under PowerShell execution policy
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $script:Root "backend"))) {
  $script:Root = "C:\fitness_prog"
}

$script:BackendDir = Join-Path $script:Root "backend"
$script:FrontendDir = Join-Path $script:Root "frontend"
$script:ScriptsDir = Join-Path $script:Root "scripts"
$script:BackendPort = 8001
$script:FrontendPort = 5173
$script:Py = Join-Path $script:BackendDir ".venv\Scripts\python.exe"
$script:Uvicorn = Join-Path $script:BackendDir ".venv\Scripts\uvicorn.exe"
$script:Arq = Join-Path $script:BackendDir ".venv\Scripts\arq.exe"

function Write-FitnessInfo([string]$Message) {
  Write-Host "[fitness] $Message" -ForegroundColor Cyan
}

function Write-FitnessOk([string]$Message) {
  Write-Host "[fitness] $Message" -ForegroundColor Green
}

function Write-FitnessWarn([string]$Message) {
  Write-Host "[fitness] $Message" -ForegroundColor Yellow
}

function Get-FitnessPortPids {
  param([Parameter(Mandatory = $true)][int]$Port)
  @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
}

function Stop-FitnessPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [string]$Label = "port"
  )
  $pids = Get-FitnessPortPids -Port $Port
  if (@($pids).Count -eq 0) {
    Write-FitnessInfo "$Label :$Port is free"
    return
  }
  foreach ($procId in $pids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $name = if ($p) { $p.ProcessName } else { "?" }
      Write-FitnessWarn "Stopping $Label PID $procId ($name) on :$Port"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } catch {
      Write-FitnessWarn "Could not stop PID $procId"
    }
  }
  Start-Sleep -Milliseconds 400
}

function Test-FitnessBackendReady {
  param([int]$TimeoutSec = 20)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$script:BackendPort/docs" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-Backend {
  param([switch]$Reload)

  if (-not (Test-Path $script:Uvicorn)) {
    throw "uvicorn not found: $script:Uvicorn - create venv and pip install -e .[dev]"
  }

  $listening = Get-FitnessPortPids -Port $script:BackendPort
  if (@($listening).Count -gt 0) {
    Write-FitnessWarn "Backend already listening on :$script:BackendPort (PIDs: $($listening -join ', '))"
    return
  }

  $reloadArg = if ($Reload) { " --reload" } else { "" }
  $cmd = @"
Set-Location '$script:BackendDir'
Write-Host 'Backend uvicorn :$script:BackendPort' -ForegroundColor Green
& '$script:Uvicorn' app.main:app --host 127.0.0.1 --port $script:BackendPort$reloadArg
"@
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit", "-NoProfile", "-Command", $cmd
  ) | Out-Null
  Write-FitnessInfo "Starting backend window..."
  if (Test-FitnessBackendReady -TimeoutSec 25) {
    Write-FitnessOk "Backend OK  http://127.0.0.1:$script:BackendPort/docs"
  } else {
    Write-FitnessWarn "Backend window started, but /docs not ready yet - check that window"
  }
}

function Restart-Backend {
  param([switch]$Reload)
  Stop-FitnessPort -Port $script:BackendPort -Label "backend"
  Start-Sleep -Milliseconds 300
  Start-Backend -Reload:$Reload
}

function Stop-Backend {
  Stop-FitnessPort -Port $script:BackendPort -Label "backend"
}

function Start-Frontend {
  $listening = Get-FitnessPortPids -Port $script:FrontendPort
  if (@($listening).Count -gt 0) {
    Write-FitnessWarn "Frontend already listening on :$script:FrontendPort (PIDs: $($listening -join ', '))"
    return
  }
  if (-not (Test-Path (Join-Path $script:FrontendDir "package.json"))) {
    throw "frontend package.json not found: $script:FrontendDir"
  }

  $cmd = @"
Set-Location '$script:FrontendDir'
Write-Host 'Frontend Vite :$script:FrontendPort' -ForegroundColor Green
npm.cmd run dev -- --host 0.0.0.0 --port $script:FrontendPort
"@
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit", "-NoProfile", "-Command", $cmd
  ) | Out-Null
  Write-FitnessOk "Frontend window started  http://127.0.0.1:$script:FrontendPort"
}

function Restart-Frontend {
  Stop-FitnessPort -Port $script:FrontendPort -Label "frontend"
  Start-Sleep -Milliseconds 300
  Start-Frontend
}

function Stop-Frontend {
  Stop-FitnessPort -Port $script:FrontendPort -Label "frontend"
}

function Start-Ngrok {
  throw "ngrok отключён: он создаёт устаревающие кнопки и показывает предупреждение. Используйте start-all.cmd и Tailscale Funnel."
}

function Start-Worker {
  if (-not (Test-Path $script:Arq)) {
    throw "arq not found: $script:Arq"
  }
  $cmd = @"
Set-Location '$script:BackendDir'
Write-Host 'ARQ worker' -ForegroundColor Green
& '$script:Arq' app.tasks.notifications.WorkerSettings
"@
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit", "-NoProfile", "-Command", $cmd
  ) | Out-Null
  Write-FitnessOk "Worker window started"
}

function Start-FitnessStack {
  param([switch]$WithNgrok, [switch]$Reload)
  Start-Backend -Reload:$Reload
  Start-Frontend
  if ($WithNgrok) { Start-Ngrok }
  Get-FitnessStatus
}

function Restart-FitnessStack {
  param([switch]$WithNgrok, [switch]$Reload)
  Restart-Backend -Reload:$Reload
  Restart-Frontend
  if ($WithNgrok) { Start-Ngrok }
  Get-FitnessStatus
}

function Stop-FitnessStack {
  Stop-Backend
  Stop-Frontend
  Write-FitnessOk "Stack stopped (Tailscale Funnel remains configured)"
}

function Get-FitnessStatus {
  Write-Host ""
  Write-Host "=== fitness_prog status ===" -ForegroundColor Magenta
  Write-Host "Root: $script:Root"

  foreach ($pair in @(
      @{ Name = "app/api "; Port = $script:BackendPort; Url = "http://127.0.0.1:$script:BackendPort"; Optional = $false },
      @{ Name = "dev Vite"; Port = $script:FrontendPort; Url = "http://127.0.0.1:$script:FrontendPort"; Optional = $true }
    )) {
    $pids = Get-FitnessPortPids -Port $pair.Port
    $reachable = $false
    try {
      $response = Invoke-WebRequest -Uri $pair.Url -UseBasicParsing -TimeoutSec 2
      $reachable = $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch { }
    if (@($pids).Count -gt 0) {
      Write-Host ("  {0} :{1} LISTEN pids={2}  {3}" -f $pair.Name, $pair.Port, ($pids -join ","), $pair.Url) -ForegroundColor Green
    } elseif ($reachable) {
      Write-Host ("  {0} :{1} UP (PID requires elevation)  {2}" -f $pair.Name, $pair.Port, $pair.Url) -ForegroundColor Green
    } elseif ($pair.Optional) {
      Write-Host ("  {0} :{1} OFF (normal in production)" -f $pair.Name, $pair.Port) -ForegroundColor DarkGray
    } else {
      Write-Host ("  {0} :{1} DOWN" -f $pair.Name, $pair.Port) -ForegroundColor DarkYellow
    }
  }

  $urlFile = Join-Path $script:ScriptsDir "tailscale-url.local.env"
  if (Test-Path $urlFile) {
    Write-Host "  tunnel  Tailscale Funnel" -ForegroundColor Green
    Write-Host "  saved   $urlFile" -ForegroundColor DarkGray
    Get-Content $urlFile | ForEach-Object { Write-Host "          $_" -ForegroundColor DarkGray }
  } else {
    Write-Host "  tunnel  URL not configured" -ForegroundColor DarkYellow
  }
  Write-Host ""
}

function Invoke-FitnessMigrate {
  $scriptPath = Join-Path $script:ScriptsDir "apply_migrations_local.ps1"
  if (Test-Path $scriptPath) {
    Write-FitnessInfo "Running apply_migrations_local.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath
  } else {
    Write-FitnessWarn "No apply_migrations_local.ps1 - apply SQL from supabase/ manually"
  }
}

function Invoke-FitnessSeed {
  if (-not (Test-Path $script:Py)) { throw "python venv missing: $script:Py" }
  Write-FitnessInfo "Seed prod content..."
  & $script:Py (Join-Path $script:BackendDir "scripts\seed_prod_content.py")
}

function Invoke-FitnessTest {
  Write-FitnessInfo "Backend pytest..."
  Push-Location $script:BackendDir
  try {
    & $script:Py -m pytest -q
  } finally {
    Pop-Location
  }
  Write-FitnessInfo "Frontend vitest + build..."
  Push-Location $script:FrontendDir
  try {
    cmd /c "npm.cmd test -- --run"
    cmd /c "npm.cmd run build"
  } finally {
    Pop-Location
  }
}

function Show-FitnessHelp {
  $help = @"

fitness_prog - local commands

  Set-ExecutionPolicy -Scope Process Bypass -Force
  . C:\fitness_prog\scripts\dev.ps1

START
  Start-Backend [-Reload]     uvicorn 127.0.0.1:8001
  Start-Frontend              vite 0.0.0.0:5173
  start-all.cmd               production build + app :8001 + Funnel + Telegram
  dev-local.cmd               backend reload + Vite :5173 (supervisor paused)
  publish-local.cmd           build/publish + supervisor resume
  Start-Worker                arq reminders (Redis)
  Start-FitnessStack [-WithNgrok] [-Reload]

RESTART / STOP
  Restart-Backend [-Reload]
  Restart-Frontend
  Restart-FitnessStack [-WithNgrok] [-Reload]
  Stop-Backend | Stop-Frontend | Stop-FitnessStack

STATUS / DATA
  Get-FitnessStatus
  Invoke-FitnessMigrate
  Invoke-FitnessSeed
  Invoke-FitnessTest

ONE-LINERS (cmd wrapper bypasses ExecutionPolicy)
  C:\fitness_prog\scripts\dev.cmd status
  C:\fitness_prog\scripts\dev.cmd start
  C:\fitness_prog\scripts\dev.cmd restart-backend
  C:\fitness_prog\scripts\dev.cmd restart-frontend
  C:\fitness_prog\scripts\dev.cmd restart
  C:\fitness_prog\scripts\dev.cmd stop
  C:\fitness_prog\scripts\dev.cmd help

RAW copy-paste
  cd C:\fitness_prog\backend
  .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001

  cd C:\fitness_prog\frontend
  npm.cmd run dev -- --host 0.0.0.0 --port 5173

NOTES
  - DATABASE_URL: use 127.0.0.1 not localhost (Windows)
  - Telegram WebApp URL = Tailscale Funnel HTTPS (FastAPI serves UI and API on :8001)
  - Profile / calorie targets need backend restart after pulling energy code
  - Kill stuck port: Stop-FitnessPort -Port 8001

"@
  Write-Host $help
}

# CLI entry when executed (not dot-sourced)
$isDotSourced = $MyInvocation.InvocationName -eq "." -or $MyInvocation.Line -match '^\s*\.\s+'

if (-not $isDotSourced) {
  $action = if ($args.Count -gt 0) { "$($args[0])".ToLowerInvariant() } else { "help" }
  switch -Regex ($action) {
    "^(help|-h|--help)$" { Show-FitnessHelp; break }
    "^status$" { Get-FitnessStatus; break }
    "^start$" { Start-FitnessStack; break }
    "^start-all$" {
      $all = Join-Path $script:ScriptsDir "start-all.ps1"
      $extra = @()
      if ($args.Count -gt 1) { $extra = $args[1..($args.Count - 1)] }
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $all @extra
      break
    }
    "^start-backend$" { Start-Backend; break }
    "^start-frontend$" { Start-Frontend; break }
    "^start-ngrok$" { Start-Ngrok; break }
    "^restart$" { Restart-FitnessStack; break }
    "^restart-backend$" { Restart-Backend; break }
    "^restart-frontend$" { Restart-Frontend; break }
    "^stop$" { Stop-FitnessStack; break }
    "^stop-backend$" { Stop-Backend; break }
    "^stop-frontend$" { Stop-Frontend; break }
    "^seed$" { Invoke-FitnessSeed; break }
    "^test$" { Invoke-FitnessTest; break }
    "^migrate$" { Invoke-FitnessMigrate; break }
    default {
      Write-FitnessWarn "Unknown action: $action"
      Show-FitnessHelp
      exit 1
    }
  }
} else {
  Write-FitnessOk "Loaded dev helpers from $PSCommandPath"
  Write-FitnessInfo "Try: Get-FitnessStatus | Start-FitnessStack | Restart-Backend | Show-FitnessHelp"
}
