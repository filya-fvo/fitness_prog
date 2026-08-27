#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$SourcePath = Join-Path $Root "backend\.env"

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "Missing backend\.env"
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function New-HexSecret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function Get-Value([hashtable]$Values, [string]$Name, [string]$Default = "") {
  if ($Values.ContainsKey($Name) -and $Values[$Name]) {
    return [string]$Values[$Name]
  }
  return $Default
}

function Format-Line([string]$Name, [string]$Value) {
  if ($Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "$Name contains a newline"
  }
  if ($Value.Contains("'")) {
    throw "$Name contains a single quote; encode or rotate this value first"
  }
  return "$Name='$Value'"
}

$source = Read-DotEnv $SourcePath
$botToken = Get-Value $source "BOT_TOKEN"
if (-not $botToken -or $botToken.StartsWith("replace_with")) {
  throw "BOT_TOKEN is missing in backend\.env"
}

$postgresPassword = New-HexSecret 24
$jwtSecret = Get-Value $source "JWT_SECRET"
if ($jwtSecret.Length -lt 32 -or $jwtSecret.StartsWith("replace_with")) {
  $jwtSecret = New-HexSecret 32
}
$webhookSecret = Get-Value $source "TELEGRAM_WEBHOOK_SECRET"
if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{16,256}$') {
  $webhookSecret = New-HexSecret 24
}
$botUsername = Get-Value $source "BOT_USERNAME" "fil_fit_bot"
$acmeEmail = Get-Value $source "SMTP_FROM_EMAIL" "fil_fit_bot@mail.ru"

$settings = [ordered]@{
  ENVIRONMENT = "production"
  APP_DOMAIN = "app.filfitclub.ru"
  API_DOMAIN = "api.filfitclub.ru"
  ACME_EMAIL = $acmeEmail
  MINI_APP_URL = "https://app.filfitclub.ru"
  VITE_API_URL = "https://api.filfitclub.ru"
  VITE_BOT_USERNAME = $botUsername
  VITE_SENTRY_DSN = Get-Value $source "SENTRY_DSN"
  POSTGRES_USER = "fitness"
  POSTGRES_PASSWORD = $postgresPassword
  POSTGRES_DB = "fitness"
  DATABASE_URL = "postgresql+asyncpg://fitness:$postgresPassword@db:5432/fitness"
  BOT_TOKEN = $botToken
  BOT_USERNAME = $botUsername
  TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  JWT_SECRET = $jwtSecret
  JWT_ALGORITHM = Get-Value $source "JWT_ALGORITHM" "HS256"
  JWT_EXPIRE_DAYS = Get-Value $source "JWT_EXPIRE_DAYS" "30"
  CORS_ORIGINS = "https://web.telegram.org,https://app.filfitclub.ru"
  REDIS_URL = "redis://redis:6379/0"
  SENTRY_DSN = Get-Value $source "SENTRY_DSN"
  WEB_PUSH_VAPID_PUBLIC_KEY = Get-Value $source "WEB_PUSH_VAPID_PUBLIC_KEY"
  WEB_PUSH_VAPID_PRIVATE_KEY = Get-Value $source "WEB_PUSH_VAPID_PRIVATE_KEY"
  WEB_PUSH_VAPID_SUBJECT = Get-Value $source "WEB_PUSH_VAPID_SUBJECT" "mailto:admin@example.com"
  LLM_PROVIDER = "local"
  LLM_API_KEY = Get-Value $source "LLM_API_KEY"
  LLM_BASE_URL = "http://llm:8080/v1"
  LLM_MODEL = "qwen2.5-3b-instruct"
  LLM_TIMEOUT_SECONDS = "75"
  LLM_MAX_OUTPUT_TOKENS = "320"
  OCR_BASE_URL = "http://ocr:8090"
  OCR_TIMEOUT_SECONDS = "35"
  LOCAL_AI_MODELS_DIR = "/opt/fitness/models"
  SMTP_FROM_EMAIL = Get-Value $source "SMTP_FROM_EMAIL"
  SMTP_FROM_NAME = Get-Value $source "SMTP_FROM_NAME" "Fil Fit"
  SMTP_HOST = Get-Value $source "SMTP_HOST"
  SMTP_PORT = Get-Value $source "SMTP_PORT" "465"
  SMTP_USERNAME = Get-Value $source "SMTP_USERNAME"
  SMTP_PASSWORD = Get-Value $source "SMTP_PASSWORD"
  SMTP_USE_SSL = Get-Value $source "SMTP_USE_SSL" "true"
  EMAIL_OTP_TTL_MINUTES = Get-Value $source "EMAIL_OTP_TTL_MINUTES" "10"
  EMAIL_OTP_LENGTH = Get-Value $source "EMAIL_OTP_LENGTH" "6"
  EMAIL_OTP_MAX_ATTEMPTS = Get-Value $source "EMAIL_OTP_MAX_ATTEMPTS" "5"
  EMAIL_OTP_RESEND_SECONDS = Get-Value $source "EMAIL_OTP_RESEND_SECONDS" "60"
  EMAIL_OTP_IP_HOURLY_LIMIT = Get-Value $source "EMAIL_OTP_IP_HOURLY_LIMIT" "20"
  EMAIL_OTP_DEV_RETURN_CODE = "false"
  ADMIN_FEEDBACK_EMAIL = Get-Value $source "ADMIN_FEEDBACK_EMAIL"
  FEEDBACK_HOURLY_LIMIT = Get-Value $source "FEEDBACK_HOURLY_LIMIT" "8"
  ADMIN_TELEGRAM_USERNAMES = Get-Value $source "ADMIN_TELEGRAM_USERNAMES"
  ADMIN_TELEGRAM_IDS = Get-Value $source "ADMIN_TELEGRAM_IDS"
  LOG_DIR = "/app/logs"
  LOG_ARCHIVE_DAYS = Get-Value $source "LOG_ARCHIVE_DAYS" "30"
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$lines = foreach ($item in $settings.GetEnumerator()) {
  Format-Line ([string]$item.Key) ([string]$item.Value)
}
[IO.File]::WriteAllLines($resolvedOutput, $lines, (New-Object Text.UTF8Encoding($false)))

Write-Host "[OK] Production env prepared without printing values" -ForegroundColor Green
Write-Host "Path: $resolvedOutput"
Write-Host "Variables: $($settings.Count)"
