#Requires -Version 5.1
<#
.SYNOPSIS
  Restore the standard Telegram menu and configure the /start webhook.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File <project>\scripts\setup_telegram_bot.ps1

  # custom public front URL:
  powershell -NoProfile -ExecutionPolicy Bypass -File <project>\scripts\setup_telegram_bot.ps1 `
    -MiniAppUrl https://fitness-pc.example.ts.net
#>
param(
  [string]$MiniAppUrl = "",
  [string]$WebhookBase = "",
  [switch]$SkipWebhook,
  [switch]$SkipMenu
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendEnv = Join-Path $Root "backend\.env"
$UrlsFile = Join-Path $Root "scripts\tailscale-url.local.env"
$SyncEntrypoints = Join-Path $Root "backend\scripts\sync_telegram_entrypoints.py"
$BackendPython = Join-Path $Root "backend\.venv\Scripts\python.exe"

function Read-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path $Path)) { return "" }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Read-UrlFileValue([string]$Path, [string]$Key) {
  if (-not (Test-Path $Path)) { return "" }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  $val = ($line -split "=", 2)[1]
  # strip inline comments
  if ($val -match "^(.*?)(\s+#.*)?$") { $val = $Matches[1] }
  return $val.Trim().Trim('"')
}

$token = Read-DotEnvValue $BackendEnv "BOT_TOKEN"
if (-not $token -or $token.StartsWith("replace_with")) {
  throw "BOT_TOKEN missing in backend\.env"
}

if (-not $MiniAppUrl) {
  $MiniAppUrl = Read-UrlFileValue $UrlsFile "FRONTEND_PUBLIC_URL"
}
if (-not $MiniAppUrl) {
  $MiniAppUrl = Read-DotEnvValue $BackendEnv "MINI_APP_URL"
}

$MiniAppUrl = ($MiniAppUrl -replace "/$", "").Trim()
if (-not $MiniAppUrl.StartsWith("https://")) {
  throw "Need public HTTPS Mini App URL. Pass -MiniAppUrl, set MINI_APP_URL, or start Tailscale Funnel."
}
$miniHost = ([uri]$MiniAppUrl).DnsSafeHost.ToLowerInvariant()
if ($miniHost.Contains("ngrok")) {
  throw "ngrok URL is forbidden. Start Tailscale Funnel and use its *.ts.net URL."
}

if (-not $WebhookBase) {
  $WebhookBase = $MiniAppUrl
}
$WebhookBase = ($WebhookBase -replace "/$", "").Trim()
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
Write-Host "  1) The production app + Tailscale Funnel must be running (start-all.cmd)"
Write-Host "  2) In Telegram: open @bot -> /start -> expect welcome + Open"
Write-Host "  3) Persistent Open near the message field should be absent"
Write-Host ""
