#Requires -Version 5.1
param()

$ErrorActionPreference = "Stop"
$Root = (Split-Path -Parent $PSScriptRoot).TrimEnd("\")
$LogDir = Join-Path $Root "logs"
if (-not (Test-Path -LiteralPath (Join-Path $Root "backend"))) {
  throw "Fitness project root not found: $Root"
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$requestedAt = [DateTime]::UtcNow.ToString("o")
Set-Content -LiteralPath (Join-Path $LogDir "restart-api.request") -Value $requestedAt -Encoding utf8
Set-Content -LiteralPath (Join-Path $LogDir "restart-worker.request") -Value $requestedAt -Encoding utf8
Write-Host "[OK] API and notification worker restart requested." -ForegroundColor Green
Write-Host "Supervisor will validate process ownership and restore health." -ForegroundColor Cyan
