#Requires -Version 5.1
param(
  [int]$Port = 8001,
  [string]$OutputFile = "",
  [switch]$Interactive
)

$ErrorActionPreference = "Stop"

function Resolve-TailscaleExe {
  $command = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $installed = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (Test-Path -LiteralPath $installed) { return $installed }

  throw "Tailscale не установлен. Скачайте его с https://tailscale.com/download/windows"
}

function Read-TailscaleStatus([string]$Exe) {
  $raw = (& $Exe status --json 2>&1 | Out-String).Trim()
  if (-not $raw) { throw "Tailscale не вернул статус." }
  try {
    return $raw | ConvertFrom-Json
  } catch {
    throw "Не удалось прочитать статус Tailscale: $raw"
  }
}

$tailscale = Resolve-TailscaleExe
$status = Read-TailscaleStatus $tailscale
if ($status.BackendState -ne "Running" -or -not $status.Self.Online) {
  throw "Tailscale не подключён. Откройте Tailscale в системном трее и выполните Log in."
}

$dnsName = ([string]$status.Self.DNSName).Trim().TrimEnd(".")
if (-not $dnsName) {
  throw "У устройства нет имени MagicDNS. Включите MagicDNS в панели Tailscale."
}

$funnelOutput = (& $tailscale funnel --bg $Port 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  if ($Interactive) {
    Write-Host "Tailscale требует подтверждения Funnel:" -ForegroundColor Yellow
    Write-Host $funnelOutput
    [void](Read-Host "Откройте показанную ссылку, подтвердите Funnel и нажмите Enter")
    $funnelOutput = (& $tailscale funnel --bg $Port 2>&1 | Out-String).Trim()
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Не удалось включить Tailscale Funnel: $funnelOutput"
  }
}

$publicUrl = "https://$dnsName"
if ($OutputFile) {
  $parent = Split-Path -Parent $OutputFile
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  $stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  @(
    "TUNNEL_PROVIDER=tailscale"
    "FRONTEND_PUBLIC_URL=$publicUrl"
    "BACKEND_PUBLIC_URL=$publicUrl"
    "VITE_API_URL="
    "UpdatedAt=$stamp"
  ) | Set-Content -LiteralPath $OutputFile -Encoding utf8
}

Write-Output $publicUrl
