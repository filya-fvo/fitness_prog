#Requires -Version 5.1
param(
  [string]$ApiBase = "http://127.0.0.1:8001",
  [string]$FeBase = "http://127.0.0.1:5173"
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$BackendEnv = Join-Path $Root "backend\.env"
$UrlsFile = Join-Path $Root "scripts\ngrok-urls.local.env"
$fail = 0

function Read-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path $Path)) { return "" }
  $line = Get-Content $Path -ErrorAction SilentlyContinue |
    Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } |
    Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Ok([string]$msg) { Write-Host ("  [OK]  " + $msg) -ForegroundColor Green }
function Bad([string]$msg) { Write-Host ("  [!!]  " + $msg) -ForegroundColor Red; $script:fail++ }
function Info([string]$msg) { Write-Host ("  [--]  " + $msg) -ForegroundColor DarkGray }
function Sec([string]$title) { Write-Host ""; Write-Host ("== " + $title + " ==") -ForegroundColor Cyan }

Sec "Local services"
try {
  $h = Invoke-RestMethod -Uri ($ApiBase.TrimEnd("/") + "/health") -TimeoutSec 3
  Ok ("API " + $ApiBase + " health=" + $h.status)
} catch {
  Bad ("API not reachable at " + $ApiBase)
}
try {
  $r = Invoke-WebRequest -Uri $FeBase -UseBasicParsing -TimeoutSec 3
  Ok ("Frontend " + $FeBase + " status=" + $r.StatusCode)
} catch {
  Bad ("Frontend not reachable at " + $FeBase)
}

Sec "Env (no secrets printed)"
$token = Read-DotEnvValue $BackendEnv "BOT_TOKEN"
$mini = Read-DotEnvValue $BackendEnv "MINI_APP_URL"
$user = Read-DotEnvValue $BackendEnv "BOT_USERNAME"
$smtpHost = Read-DotEnvValue $BackendEnv "SMTP_HOST"
$smtpUser = Read-DotEnvValue $BackendEnv "SMTP_USER"
$smtpPass = Read-DotEnvValue $BackendEnv "SMTP_PASSWORD"
$whSecret = Read-DotEnvValue $BackendEnv "TELEGRAM_WEBHOOK_SECRET"

if ($token -and -not $token.StartsWith("replace_with")) { Ok "BOT_TOKEN set" } else { Bad "BOT_TOKEN missing" }
if ($user) { Ok ("BOT_USERNAME=" + $user) } else { Info "BOT_USERNAME empty" }
if ($mini -and $mini.StartsWith("https://")) { Ok "MINI_APP_URL is https" } else { Bad "MINI_APP_URL not https (need ngrok/prod)" }
if ($smtpHost -and $smtpUser -and $smtpPass) { Ok "SMTP host/user/pass present" } else { Info "SMTP incomplete - OTP may use dev_log" }
if ($whSecret) { Ok "TELEGRAM_WEBHOOK_SECRET set" } else { Info "webhook secret empty (ok for local)" }

Sec "ngrok"
try {
  $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
  $https = @($tunnels.tunnels | Where-Object { $_.public_url -like "https://*" })
  if ($https.Count -gt 0) {
    Ok ("ngrok https: " + $https[0].public_url)
  } else {
    Bad "ngrok running but no https tunnel"
  }
} catch {
  Info "ngrok inspector :4040 not up (local-only mode?)"
}
if (Test-Path $UrlsFile) { Info ("urls file: " + $UrlsFile) }

Sec "Telegram Bot API"
if ($token -and -not $token.StartsWith("replace_with")) {
  try {
    $me = Invoke-RestMethod -Uri ("https://api.telegram.org/bot" + $token + "/getMe") -TimeoutSec 10
    if ($me.ok) { Ok ("getMe @" + $me.result.username) } else { Bad "getMe failed" }
  } catch {
    Bad ("getMe error: " + $_.Exception.Message)
  }

  try {
    $wh = Invoke-RestMethod -Uri ("https://api.telegram.org/bot" + $token + "/getWebhookInfo") -TimeoutSec 10
    if ($wh.ok) {
      $u = [string]$wh.result.url
      if ($u) { Ok ("webhook url set: " + $u) } else { Bad "webhook url EMPTY - /start will not reach API" }
      $le = [string]$wh.result.last_error_message
      if ($le) { Bad ("webhook last_error: " + $le) } else { Ok "webhook no last_error_message" }
      Info ("pending_update_count=" + $wh.result.pending_update_count)
    }
  } catch {
    Bad "getWebhookInfo failed"
  }

  try {
    $menu = Invoke-RestMethod -Uri ("https://api.telegram.org/bot" + $token + "/getChatMenuButton") -Method Post -TimeoutSec 10 -ContentType "application/json" -Body "{}"
    if ($menu.ok) {
      $t = [string]$menu.result.type
      if ($t -eq "web_app") {
        Ok ("Menu Button type=web_app text=" + $menu.result.text)
      } else {
        Info ("Menu Button type=" + $t + " (run setup_telegram_bot.ps1 for Open)")
      }
    }
  } catch {
    Info "getChatMenuButton skipped/failed"
  }
} else {
  Info "skip Telegram checks - no token"
}

Sec "Redis / notifications worker"
try {
  $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -WarningAction SilentlyContinue
  if ($tcp.TcpTestSucceeded) {
    Ok "Redis/Memurai :6379 open"
  } else {
    Info "Redis :6379 closed - reminders need start-notifications.cmd"
  }
} catch {
  Info "could not probe :6379"
}

Sec "Device QA checklist (manual in Telegram)"
$checklist = @(
  "1) /start -> welcome + reply keyboard Open /start /help",
  "2) Open (inline + menu) -> Mini App loads and stays open",
  "3) Auth via initData; Home CTA works",
  "4) Start workout -> set -> rest -> finish",
  "5) Nutrition: barcode (iOS ZXing) or manual EAN -> add",
  "6) Profile: birth date -> age text; save body",
  "7) Progress: weekly overview card",
  "8) Active workout: AI chips (replace / easier / no gear / technique)",
  "9) Offline: one set queued -> back online flush",
  "10) Notifications: save settings; worker running for push",
  "",
  "Setup helpers:",
  "  start-all.cmd",
  "  scripts\setup_telegram_bot.ps1",
  "  start-notifications.cmd",
  "  status.cmd / status-notifications.cmd"
)
foreach ($line in $checklist) { Write-Host ("  " + $line) }

Write-Host ""
if ($fail -gt 0) {
  Write-Host ("RESULT: " + $fail + " issue(s) - fix before full device E2E") -ForegroundColor Yellow
  exit 1
}

Write-Host "RESULT: local ops look OK - run Telegram device checklist above" -ForegroundColor Green
exit 0
