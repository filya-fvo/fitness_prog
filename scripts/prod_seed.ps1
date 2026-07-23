# Seed production/staging DB with 100 exercises + template programs.
# Usage:
#   $env:DATABASE_URL = "postgresql+asyncpg://..."
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prod_seed.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$py = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
    throw "Missing backend venv python: $py"
}
if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL not set — using backend/.env via app settings"
}

Push-Location $backend
try {
    & $py scripts\generate_seed_content.py
    if ($LASTEXITCODE -ne 0) { throw "generate_seed_content failed" }
    & $py scripts\seed_prod_content.py
    if ($LASTEXITCODE -ne 0) { throw "seed_prod_content failed" }
    Write-Host "PROD_SEED_OK"
}
finally {
    Pop-Location
}
