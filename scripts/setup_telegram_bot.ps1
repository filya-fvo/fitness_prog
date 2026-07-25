#Requires -Version 5.1
<#
.SYNOPSIS
  Configure Telegram Menu Button (Open) + webhook for /start welcome.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\setup_telegram_bot.ps1

  # custom public front URL:
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\fitness_prog\scripts\setup_telegram_bot.ps1 `
    -MiniAppUrl https://xxxx.ngrok-free.dev
#>
param(
  [string]$MiniAppUrl = "",
  [string]$WebhookBase = "",
  [string]$MenuText = "Open",
  [switch]$SkipWebhook,
  [switch]$SkipMenu
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendEnv = Join-Path $Root "backend\.env"
$UrlsFile = Join-Path $Root "scripts\ngrok-urls.local.env"

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
  $MiniAppUrl = Read-DotEnvValue $BackendEnv "MINI_APP_URL"
}
if (-not $MiniAppUrl) {
  $MiniAppUrl = Read-UrlFileValue $UrlsFile "FRONTEND_PUBLIC_URL"
}
if (-not $MiniAppUrl) {
  try {
    $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
    $https = $tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
    if ($https) { $MiniAppUrl = $https.public_url }
  } catch { }
}

$MiniAppUrl = ($MiniAppUrl -replace "/$", "").Trim()
if (-not $MiniAppUrl.StartsWith("https://")) {
  throw "Need public HTTPS Mini App URL (ngrok). Pass -MiniAppUrl or set MINI_APP_URL / start ngrok."
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
    menu_button = @{
      type = "web_app"
      text = $MenuText
      web_app = @{ url = $MiniAppUrl }
    }
  } | ConvertTo-Json -Depth 6
  $menuResp = Invoke-RestMethod -Method Post -Uri "$api/setChatMenuButton" -ContentType "application/json; charset=utf-8" -Body $menuBody
  if (-not $menuResp.ok) { throw "setChatMenuButton failed: $($menuResp | ConvertTo-Json -Compress)" }
  Write-Host "[telegram] Menu Button set to '$MenuText' -> $MiniAppUrl" -ForegroundColor Green
}

if (-not $SkipWebhook) {
  $secret = Read-DotEnvValue $BackendEnv "TELEGRAM_WEBHOOK_SECRET"
  $wh = @{
    url = $WebhookUrl
    allowed_updates = @("message")
    drop_pending_updates = $true
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
Write-Host "  1) Backend + frontend + ngrok must be running (dev.cmd start / start-ngrok)"
Write-Host "  2) Restart backend so it reloads MINI_APP_URL: dev.cmd restart-backend"
Write-Host "  3) In Telegram: open @bot -> /start -> expect welcome + Open"
Write-Host "  4) Blue Open near message field / chat list should open Mini App"
Write-Host ""
