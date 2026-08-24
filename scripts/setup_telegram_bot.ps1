#Requires -Version 5.1
<#
.SYNOPSIS
  Restore the standard Telegram menu and configure the /start webhook.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File <project>\scripts\setup_telegram_bot.ps1

  # production domains:
  powershell -NoProfile -ExecutionPolicy Bypass -File <project>\scripts\setup_telegram_bot.ps1 `
    -MiniAppUrl https://app.filfitclub.ru `
    -WebhookBase https://api.filfitclub.ru
#>
param(
  [string]$MiniAppUrl = "",
  [string]$WebhookBase = "https://api.filfitclub.ru",
  [switch]$SkipWebhook,
  [switch]$SkipMenu
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendEnv = Join-Path $Root "backend\.env"
$SyncEntrypoints = Join-Path $Root "backend\scripts\sync_telegram_entrypoints.py"
$BackendPython = Join-Path $Root "backend\.venv\Scripts\python.exe"

function Read-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path $Path)) { return "" }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

$token = Read-DotEnvValue $BackendEnv "BOT_TOKEN"
if (-not $token -or $token.StartsWith("replace_with")) {
  throw "BOT_TOKEN missing in backend\.env"
}

if (-not $MiniAppUrl) {
  $MiniAppUrl = Read-DotEnvValue $BackendEnv "MINI_APP_URL"
}

$MiniAppUrl = ($MiniAppUrl -replace "/$", "").Trim()
if (-not $MiniAppUrl.StartsWith("https://")) {
  throw "Need a permanent public HTTPS Mini App URL. Pass -MiniAppUrl or set MINI_APP_URL."
}
$miniHost = ([uri]$MiniAppUrl).DnsSafeHost.ToLowerInvariant()
if ($miniHost.Contains("ngrok")) {
  throw "ngrok URL is forbidden. Configure the permanent application domain."
}

if (-not $WebhookBase) {
  $WebhookBase = Read-DotEnvValue $BackendEnv "VITE_API_URL"
}
$WebhookBase = ($WebhookBase -replace "/$", "").Trim()
if (-not $WebhookBase.StartsWith("https://")) {
  throw "Need a permanent public HTTPS API URL. Pass -WebhookBase or set VITE_API_URL."
}
$webhookHost = ([uri]$WebhookBase).DnsSafeHost.ToLowerInvariant()
if ($webhookHost.Contains("ngrok")) {
  throw "ngrok URL is forbidden. Configure the permanent API domain."
}
$WebhookUrl = "$WebhookBase/telegram/webhook"

Write-Host "[telegram] Mini App URL : $MiniAppUrl" -ForegroundColor Cyan
Write-Host "[telegram] Webhook URL  : $WebhookUrl" -ForegroundColor Cyan

# Persist MINI_APP_URL into backend/.env for uvicorn
if (Test-Path $BackendEnv) {
  $raw = Get-Content $BackendEnv -Raw
  if ($raw -match "(?m)^\s*MINI_APP_URL\s*=") {
    $raw = [regex]::Replace($raw, "(?m)^\s*MINI_APP_URL\s*=.*$", "MINI_APP_URL=$MiniAppUrl")
  } else {
    if (-not $raw.EndsWith("`n")) { $raw += "`n" }
    $raw += "MINI_APP_URL=$MiniAppUrl`n"
  }
  Set-Content -Path $BackendEnv -Value $raw -Encoding utf8
  Write-Host "[telegram] Wrote MINI_APP_URL to backend\.env" -ForegroundColor Green
}

$api = "https://api.telegram.org/bot$token"

if (-not $SkipMenu) {
  $menuBody = @{
    menu_button = @{ type = "default" }
  } | ConvertTo-Json -Depth 6
  $menuResp = Invoke-RestMethod -Method Post -Uri "$api/setChatMenuButton" -ContentType "application/json; charset=utf-8" -Body $menuBody
  if (-not $menuResp.ok) { throw "setChatMenuButton failed: $($menuResp | ConvertTo-Json -Compress)" }
  Write-Host "[telegram] Standard menu restored; persistent Open button removed" -ForegroundColor Green

  if ((Test-Path -LiteralPath $BackendPython) -and (Test-Path -LiteralPath $SyncEntrypoints)) {
    Push-Location (Join-Path $Root "backend")
    try {
      & $BackendPython $SyncEntrypoints
      if ($LASTEXITCODE -ne 0) { throw "Per-chat Menu Button sync failed with code $LASTEXITCODE" }
      Write-Host "[telegram] Per-chat Menu Buttons synchronized" -ForegroundColor Green
    } finally {
      Pop-Location
    }
  } else {
    Write-Host "[telegram] WARNING: per-chat sync skipped; backend venv/script missing" -ForegroundColor Yellow
  }
}

if (-not $SkipWebhook) {
  $secret = Read-DotEnvValue $BackendEnv "TELEGRAM_WEBHOOK_SECRET"
  $wh = @{
    url = $WebhookUrl
    allowed_updates = @("message", "callback_query")
    drop_pending_updates = $false
  }
  if ($secret) { $wh.secret_token = $secret }
  $whBody = $wh | ConvertTo-Json -Depth 5
  $whResp = Invoke-RestMethod -Method Post -Uri "$api/setWebhook" -ContentType "application/json; charset=utf-8" -Body $whBody
  if (-not $whResp.ok) { throw "setWebhook failed: $($whResp | ConvertTo-Json -Compress)" }
  Write-Host "[telegram] Webhook registered" -ForegroundColor Green

  $info = Invoke-RestMethod -Method Get -Uri "$api/getWebhookInfo"
  Write-Host "[telegram] webhook info: $($info.result | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Magenta
Write-Host "  1) The production VPS must answer on both configured HTTPS domains"
Write-Host "  2) In Telegram: open @bot -> /start -> expect welcome + Open"
Write-Host "  3) Persistent Open near the message field should be absent"
Write-Host ""
