#Requires -Version 5.1
<#
.SYNOPSIS
  Idempotent first-time installer for a Windows host running Fitness Mini App.

.DESCRIPTION
  Installs system dependencies through Chocolatey, prepares backend/frontend,
  applies migrations and seed content, configures Tailscale Funnel and Telegram.
  It does not install the Scheduled Task; run install-supervisor.cmd afterwards.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-server.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-server.ps1 -DryRun
#>
param(
  [switch]$DryRun,
  [switch]$SkipSystemPackages,
  [switch]$SkipDatabase,
  [switch]$SkipSeed,
  [switch]$SkipTailscale,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$BackendEnv = Join-Path $BackendDir ".env"
$BackendEnvExample = Join-Path $BackendDir ".env.example"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
$UrlsFile = Join-Path $PSScriptRoot "tailscale-url.local.env"
$TaskInstaller = Join-Path $Root "install-supervisor.cmd"
$RebootRequired = $false

function Info([string]$Message) { Write-Host "[install] $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { throw $Message }

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = (($machinePath, $userPath) | Where-Object { $_ }) -join ";"
}

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] $Label" -ForegroundColor DarkCyan
    return
  }
  Info $Label
  & $Action
}

function Invoke-Native(
  [string]$Label,
  [string]$Executable,
  [string[]]$Arguments,
  [string]$WorkingDirectory = ""
) {
  if ($DryRun) {
    $at = if ($WorkingDirectory) { " (in $WorkingDirectory)" } else { "" }
    Write-Host "[DRY-RUN] $Label$at -> $Executable $($Arguments -join ' ')" -ForegroundColor DarkCyan
    return
  }
  Info $Label
  if ($WorkingDirectory) { Push-Location $WorkingDirectory }
  try {
    & $Executable @Arguments
    $code = $LASTEXITCODE
  } finally {
    if ($WorkingDirectory) { Pop-Location }
  }
  if ($code -notin @(0, 1641, 3010)) {
    Fail "$Label failed with exit code $code"
  }
  if ($code -in @(1641, 3010)) { $script:RebootRequired = $true }
}

function Get-EnvMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding utf8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { return }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $map[$key] = $value
  }
  return $map
}

function Get-InstallerEnvMap {
  if ($DryRun -and -not (Test-Path -LiteralPath $BackendEnv)) {
    return (Get-EnvMap $BackendEnvExample)
  }
  return (Get-EnvMap $BackendEnv)
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
  $raw = if (Test-Path -LiteralPath $Path) { Get-Content -LiteralPath $Path -Raw -Encoding utf8 } else { "" }
  $pattern = "(?m)^\s*" + [regex]::Escape($Key) + "\s*=.*$"
  if ($raw -match $pattern) {
    $raw = [regex]::Replace($raw, $pattern, "$Key=$Value")
  } else {
    if ($raw -and -not $raw.EndsWith("`n")) { $raw += "`r`n" }
    $raw += "$Key=$Value`r`n"
  }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $raw, $encoding)
}

function New-RandomSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-Secure([Security.SecureString]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Test-Placeholder([string]$Value) {
  return (-not $Value) -or $Value.StartsWith("replace_with") -or $Value.Contains("your-")
}

function Get-DatabaseParts([string]$DatabaseUrl) {
  $normalized = $DatabaseUrl -replace "^postgresql\+asyncpg://", "postgresql://"
  $uri = [uri]$normalized
  $userInfo = $uri.UserInfo
  $separator = $userInfo.IndexOf(":")
  $user = if ($separator -ge 0) { $userInfo.Substring(0, $separator) } else { $userInfo }
  $password = if ($separator -ge 0) { $userInfo.Substring($separator + 1) } else { "" }
  return [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    Database = $uri.AbsolutePath.Trim("/")
    User = [uri]::UnescapeDataString($user)
    Password = [uri]::UnescapeDataString($password)
    IsLocal = $uri.Host -in @("127.0.0.1", "localhost", "::1")
  }
}

function Find-Python312 {
  $candidates = @(
    (Join-Path $env:SystemDrive "Python312\python.exe"),
    (Join-Path $env:ProgramFiles "Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) {
    $previousPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $resolved = (& $py.Source -3.12 -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1)
    } finally {
      $ErrorActionPreference = $previousPreference
    }
    if ($resolved -and (Test-Path -LiteralPath $resolved)) { return $resolved }
  }
  $python = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($python) {
    $version = (& $python.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null)
    if ($version -eq "3.12") { return $python.Source }
  }
  return ""
}

function Find-Psql {
  $command = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $items = Get-ChildItem (Join-Path $env:ProgramFiles "PostgreSQL\*\bin\psql.exe") -ErrorAction SilentlyContinue |
    Sort-Object { [int]$_.Directory.Parent.Name } -Descending
  if ($items) { return $items[0].FullName }
  return ""
}

function Find-Tailscale {
  $command = Get-Command tailscale.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $installed = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (Test-Path -LiteralPath $installed) { return $installed }
  return ""
}

function Ensure-Chocolatey {
  $command = Get-Command choco.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  if ($DryRun) {
    Write-Host "[DRY-RUN] Install Chocolatey from the official community endpoint" -ForegroundColor DarkCyan
    return "choco.exe"
  }
  Info "Chocolatey not found; installing it"
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  $installScript = Join-Path $env:TEMP "fitness-install-chocolatey.ps1"
  Invoke-WebRequest -UseBasicParsing -Uri "https://community.chocolatey.org/install.ps1" -OutFile $installScript
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript
    if ($LASTEXITCODE -ne 0) { Fail "Chocolatey installation failed with exit code $LASTEXITCODE" }
  } finally {
    Remove-Item -LiteralPath $installScript -Force -ErrorAction SilentlyContinue
  }
  Refresh-ProcessPath
  $command = Get-Command choco.exe -ErrorAction SilentlyContinue
  if (-not $command) {
    $fallback = Join-Path ${env:ProgramData} "chocolatey\bin\choco.exe"
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    Fail "Chocolatey installed but choco.exe was not found"
  }
  return $command.Source
}

if (-not (Test-Path -LiteralPath $BackendDir) -or -not (Test-Path -LiteralPath $FrontendDir)) {
  Fail "Invalid project root: $Root"
}
if (-not $DryRun -and -not (Test-IsAdministrator)) {
  Fail "Run install-server.cmd and approve the Windows administrator prompt."
}

Write-Host ""
Write-Host "=== FITNESS APP SERVER INSTALLER ===" -ForegroundColor Magenta
Write-Host "Project root: $Root"
if ($DryRun) { Warn "DRY-RUN: no files, packages or services will be changed" }

if (-not $DryRun) {
  New-Item -ItemType Directory -Path (Join-Path $Root "logs"), (Join-Path $Root "tools") -Force | Out-Null
}

# Preserve transferred secrets. A clean installation receives generated local secrets.
$newEnvironment = -not (Test-Path -LiteralPath $BackendEnv)
if ($newEnvironment) {
  if (-not (Test-Path -LiteralPath $BackendEnvExample)) { Fail "Missing $BackendEnvExample" }
  Invoke-Step "Create backend\.env from the example" {
    Copy-Item -LiteralPath $BackendEnvExample -Destination $BackendEnv
    Set-EnvValue $BackendEnv "JWT_SECRET" (New-RandomSecret)
    Set-EnvValue $BackendEnv "TELEGRAM_WEBHOOK_SECRET" (New-RandomSecret)
    Set-EnvValue $BackendEnv "ENVIRONMENT" "production"
    Set-EnvValue $BackendEnv "REDIS_URL" "redis://127.0.0.1:6379/0"
    Set-EnvValue $BackendEnv "MINI_APP_URL" ""
    $postgresPassword = New-RandomSecret 24
    Set-EnvValue $BackendEnv "DATABASE_URL" "postgresql+asyncpg://postgres:$postgresPassword@127.0.0.1:5432/fitness"
  }
} else {
  Ok "Existing backend\.env preserved"
}

if (-not $DryRun) {
  Set-EnvValue $BackendEnv "ENVIRONMENT" "production"
}
$envMap = Get-InstallerEnvMap
if (-not $DryRun -and (Test-Placeholder ([string]$envMap["JWT_SECRET"]))) {
  Set-EnvValue $BackendEnv "JWT_SECRET" (New-RandomSecret)
}
if (-not $DryRun -and -not [string]$envMap["TELEGRAM_WEBHOOK_SECRET"]) {
  Set-EnvValue $BackendEnv "TELEGRAM_WEBHOOK_SECRET" (New-RandomSecret)
}
$envMap = Get-InstallerEnvMap

if (Test-Placeholder ([string]$envMap["BOT_TOKEN"])) {
  if ($DryRun) {
    Warn "BOT_TOKEN must be entered during a real installation"
  } elseif ($NonInteractive) {
    Fail "BOT_TOKEN is missing in backend\.env"
  } else {
    $token = ConvertFrom-Secure (Read-Host "Enter Telegram BOT_TOKEN from BotFather" -AsSecureString)
    if (-not $token) { Fail "BOT_TOKEN cannot be empty" }
    Set-EnvValue $BackendEnv "BOT_TOKEN" $token
  }
}
$envMap = Get-InstallerEnvMap
if ($newEnvironment -or (Test-Placeholder ([string]$envMap["BOT_USERNAME"]))) {
  if ($DryRun) {
    Warn "BOT_USERNAME must be entered during a real installation"
  } elseif ($NonInteractive) {
    Fail "BOT_USERNAME is missing in backend\.env"
  } else {
    $botUsername = (Read-Host "Enter Telegram bot username without @").Trim().TrimStart("@")
    if (-not $botUsername) { Fail "BOT_USERNAME cannot be empty" }
    Set-EnvValue $BackendEnv "BOT_USERNAME" $botUsername
  }
}

$envMap = Get-InstallerEnvMap
$databaseUrl = [string]$envMap["DATABASE_URL"]
if (Test-Placeholder $databaseUrl) { Fail "DATABASE_URL is missing in backend\.env" }
try { $database = Get-DatabaseParts $databaseUrl }
catch { Fail "DATABASE_URL cannot be parsed: $($_.Exception.Message)" }
if ($database.IsLocal -and -not $database.Password) {
  Fail "Local DATABASE_URL must contain a PostgreSQL password"
}

$choco = ""
if (-not $SkipSystemPackages) {
  $choco = Ensure-Chocolatey
  if (-not (Find-Python312)) {
    Invoke-Native "Install Python 3.12" $choco @("install", "python312", "-y", "--no-progress")
    Refresh-ProcessPath
  } else { Ok "Python 3.12 already installed" }

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Invoke-Native "Install Node.js LTS" $choco @("install", "nodejs-lts", "-y", "--no-progress")
    Refresh-ProcessPath
  } else { Ok "Node.js already installed" }

  if (-not (Find-Tailscale) -and -not $SkipTailscale) {
    Invoke-Native "Install Tailscale" $choco @("install", "tailscale", "-y", "--no-progress")
    Refresh-ProcessPath
  } elseif (-not $SkipTailscale) { Ok "Tailscale already installed" }

  if (-not $SkipDatabase -and -not (Find-Psql)) {
    $postgresArguments = @("install", "postgresql18", "-y", "--no-progress")
    if ($database.IsLocal) {
      $postgresArguments += @("--params", "/Password:$($database.Password) /Port:$($database.Port)")
    } else {
      $postgresArguments += @("--ia", "--enable-components commandlinetools")
    }
    Invoke-Native "Install PostgreSQL 18 tools$(if ($database.IsLocal) { ' and local server' } else { '' })" $choco $postgresArguments
    Refresh-ProcessPath
  } elseif (-not $SkipDatabase) { Ok "PostgreSQL command-line tools already installed" }
} else {
  Warn "System package installation skipped"
}

$python = Find-Python312
if (-not $python) {
  if ($DryRun) { $python = "python3.12.exe" }
  else { Fail "Python 3.12 not found after installation" }
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -and -not $DryRun) {
  Fail "Node.js not found after installation"
}

# A copied Windows venv may contain absolute paths from the previous server.
$venvUsable = $false
if (Test-Path -LiteralPath $VenvPython) {
  try {
    $probe = (& $VenvPython -c "import sys; print(sys.prefix)" 2>$null | Select-Object -First 1)
    $venvUsable = $probe -and ([IO.Path]::GetFullPath($probe).TrimEnd("\") -eq [IO.Path]::GetFullPath($VenvDir).TrimEnd("\"))
  } catch { $venvUsable = $false }
}
if (-not $venvUsable) {
  Invoke-Step "Create a portable backend virtual environment" {
    $resolvedVenv = [IO.Path]::GetFullPath($VenvDir)
    $resolvedBackend = [IO.Path]::GetFullPath($BackendDir).TrimEnd("\") + "\"
    if (-not $resolvedVenv.StartsWith($resolvedBackend, [StringComparison]::OrdinalIgnoreCase)) {
      Fail "Refusing to replace venv outside backend: $resolvedVenv"
    }
    if (Test-Path -LiteralPath $VenvDir) { Remove-Item -LiteralPath $VenvDir -Recurse -Force }
    & $python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { Fail "venv creation failed" }
  }
} else { Ok "Backend virtual environment is usable" }

Invoke-Native "Upgrade pip" $VenvPython @("-m", "pip", "install", "--upgrade", "pip")
Invoke-Native "Install backend dependencies" $VenvPip @("install", "-e", ".[dev]") $BackendDir

if (Test-Path -LiteralPath (Join-Path $FrontendDir "package-lock.json")) {
  Invoke-Native "Install exact frontend dependencies" "npm.cmd" @("ci", "--no-audit", "--no-fund") $FrontendDir
} else {
  Invoke-Native "Install frontend dependencies" "npm.cmd" @("install", "--no-audit", "--no-fund") $FrontendDir
}
Invoke-Native "Build and safely publish production frontend" "npm.cmd" @("run", "build:publish") $FrontendDir

$redisServer = Join-Path $Root "tools\redis\redis-server.exe"
if (-not (Test-Path -LiteralPath $redisServer)) {
  Invoke-Native "Download portable Redis" $VenvPython @((Join-Path $PSScriptRoot "install-redis-portable.py"))
} else { Ok "Portable Redis already present" }

if (-not $SkipDatabase) {
  if ($database.IsLocal -and -not $DryRun) {
    $postgresService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $postgresService) { Fail "Local DATABASE_URL is configured, but the PostgreSQL service was not found" }
    if ($postgresService.Status -ne "Running") {
      Info "Starting PostgreSQL service"
      Start-Service $postgresService.Name
    }
  }
  Invoke-Step "Apply database migrations" {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "apply_migrations_local.ps1")
    if ($LASTEXITCODE -ne 0) { Fail "Database migrations failed" }
  }
  if (-not $SkipSeed) {
    Invoke-Native "Seed exercises and training programs" $VenvPython @("scripts\seed_prod_content.py") $BackendDir
    Invoke-Native "Seed nutrition catalog" $VenvPython @("scripts\seed_nutrition.py") $BackendDir
  }
} else { Warn "Database migration and seed skipped" }

Invoke-Native "Check backend import" $VenvPython @("-c", "import app.main; print('backend_import=OK')") $BackendDir

if (-not $SkipTailscale) {
  $tailscale = Find-Tailscale
  if (-not $tailscale) {
    if ($DryRun) { $tailscale = "tailscale.exe" }
    else { Fail "Tailscale not found after installation" }
  }
  if (-not $DryRun) {
    $tailscaleService = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
    if ($tailscaleService -and $tailscaleService.Status -ne "Running") { Start-Service Tailscale }
    $status = $null
    try { $status = (& $tailscale status --json 2>$null | Out-String | ConvertFrom-Json) } catch { }
    if (-not $status -or $status.BackendState -ne "Running" -or -not $status.Self.Online) {
      if ($NonInteractive) { Fail "Tailscale is installed but not logged in" }
      Warn "Tailscale login is required. A browser authorization page may open."
      & $tailscale up
      if ($LASTEXITCODE -ne 0) { Fail "Tailscale login failed" }
    }
  }
  Invoke-Step "Enable Tailscale unattended mode and Funnel" {
    & $tailscale set --unattended=true
    if ($LASTEXITCODE -ne 0) { Fail "Could not enable Tailscale unattended mode" }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-tailscale-funnel.ps1") -Port 8001 -OutputFile $UrlsFile -Interactive
    if ($LASTEXITCODE -ne 0) { Fail "Tailscale Funnel setup failed" }
  }

  if (-not $DryRun) {
    $urlMap = Get-EnvMap $UrlsFile
    $publicUrl = ([string]$urlMap["FRONTEND_PUBLIC_URL"]).TrimEnd("/")
    if (-not $publicUrl.StartsWith("https://")) { Fail "Tailscale public URL was not created" }
    Set-EnvValue $BackendEnv "MINI_APP_URL" $publicUrl
    $currentCors = [string](Get-InstallerEnvMap)["CORS_ORIGINS"]
    $cors = @($currentCors -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    foreach ($origin in @("https://web.telegram.org", $publicUrl)) {
      if ($origin -notin $cors) { $cors += $origin }
    }
    Set-EnvValue $BackendEnv "CORS_ORIGINS" ($cors -join ",")
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "setup_telegram_bot.ps1") -MiniAppUrl $publicUrl
    if ($LASTEXITCODE -ne 0) { Fail "Telegram webhook/menu setup failed" }
    Ok "Public URL prepared: $publicUrl"
  }
} else { Warn "Tailscale and Telegram public entrypoint setup skipped" }

Write-Host ""
Write-Host "=== INSTALLATION COMPLETE ===" -ForegroundColor Green
if ($DryRun) {
  Write-Host "Dry-run completed. Run install-server.cmd for the real installation."
} else {
  Write-Host "Project: $Root"
  Write-Host "Secrets: existing backend\.env was preserved; generated values were not printed."
  Write-Host ""
  Write-Host "Next:" -ForegroundColor Magenta
  Write-Host "  1. Run: $TaskInstaller"
  Write-Host "  2. Approve UAC. The task is installed and started automatically."
  Write-Host "  3. Run: $(Join-Path $Root 'supervisor-status.cmd')"
  Write-Host "  4. Check: http://127.0.0.1:8001/health"
  if ($RebootRequired) { Warn "A system package requested a reboot. Reboot before installing the task." }
}
