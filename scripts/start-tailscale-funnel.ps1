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

  throw "Tailscale is not installed. Download it from https://tailscale.com/download/windows"
}

function Read-TailscaleStatus([string]$Exe) {
  $raw = (& $Exe status --json 2>&1 | Out-String).Trim()
  if (-not $raw) { throw "Tailscale did not return its status." }
  try {
    return $raw | ConvertFrom-Json
  } catch {
    throw "Could not parse Tailscale status: $raw"
  }
}

$tailscale = Resolve-TailscaleExe
$status = Read-TailscaleStatus $tailscale
$versionOutput = @(& $tailscale version 2>&1)
$clientVersion = [regex]::Match([string]$versionOutput[0], '^\d+\.\d+\.\d+').Value
$daemonVersion = [regex]::Match([string]$status.Version, '^\d+\.\d+\.\d+').Value
if ($clientVersion -and $daemonVersion -and $clientVersion -ne $daemonVersion) {
  throw "Tailscale update is incomplete: CLI=$clientVersion daemon=$daemonVersion. Wait for MSI to finish, then run elevated: Restart-Service Tailscale"
}
if (-not $status.HaveNodeKey -or $status.BackendState -eq "NeedsLogin") {
  throw "Tailscale needs authentication. Open the tray application and select Log in."
}
if ($status.BackendState -ne "Running") {
  throw "Tailscale service is not ready (state=$($status.BackendState)). Wait a few seconds or restart the service from elevated PowerShell."
}
if (-not $status.Self.Online) {
  throw "Tailscale is authenticated but the node is not online yet. Check the network and retry."
}

$dnsName = ([string]$status.Self.DNSName).Trim().TrimEnd(".")
if (-not $dnsName) {
  throw "This device has no MagicDNS name. Enable MagicDNS in the Tailscale console."
}

$funnelOutput = (& $tailscale funnel --bg $Port 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  if ($Interactive) {
    Write-Host "Tailscale requires Funnel approval:" -ForegroundColor Yellow
    Write-Host $funnelOutput
    [void](Read-Host "Open the displayed URL, approve Funnel, and press Enter")
    $funnelOutput = (& $tailscale funnel --bg $Port 2>&1 | Out-String).Trim()
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Could not enable Tailscale Funnel: $funnelOutput"
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
