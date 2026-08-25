#Requires -Version 5.1
param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root "backend\.env"
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $Root "backups\timeweb-cutover"
}

function Get-EnvValue([string]$Path, [string]$Key) {
  $line = Get-Content -LiteralPath $Path | Where-Object {
    $_ -match ("^" + [regex]::Escape($Key) + "=")
  } | Select-Object -First 1
  if (-not $line) { return "" }
  return $line.Substring($Key.Length + 1).Trim().Trim('"').Trim("'")
}

function Convert-PostgresUrl([string]$Url) {
  $normalized = $Url -replace '^postgresql\+asyncpg://', 'postgresql://'
  $uri = [Uri]$normalized
  $userinfo = $uri.UserInfo
  $separator = $userinfo.IndexOf(':')
  if ($separator -lt 0) { throw "DATABASE_URL must include a password" }
  [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }
    Database = $uri.AbsolutePath.Trim('/')
    User = [Uri]::UnescapeDataString($userinfo.Substring(0, $separator))
    Password = [Uri]::UnescapeDataString($userinfo.Substring($separator + 1))
  }
}

function Find-PostgresTool([string]$Name) {
  $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return Get-ChildItem (Join-Path $env:ProgramFiles "PostgreSQL\*\bin\$Name.exe") `
    -ErrorAction SilentlyContinue |
    Sort-Object { [int]$_.Directory.Parent.Name } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not (Test-Path -LiteralPath $EnvFile)) { throw "Missing backend\.env" }
$databaseUrl = Get-EnvValue $EnvFile "DATABASE_URL"
if (-not $databaseUrl) { throw "DATABASE_URL missing in backend\.env" }
$parts = Convert-PostgresUrl $databaseUrl
$pgDump = Find-PostgresTool "pg_dump"
$pgRestore = Find-PostgresTool "pg_restore"
if (-not $pgDump -or -not $pgRestore) { throw "PostgreSQL pg_dump/pg_restore not found" }

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$target = Join-Path $OutputDirectory ("fitness-{0}.dump" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

$oldPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $parts.Password
  & $pgDump `
    --host $parts.Host `
    --port $parts.Port `
    --username $parts.User `
    --dbname $parts.Database `
    --format custom `
    --no-owner `
    --no-privileges `
    --file $target
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with code $LASTEXITCODE" }
  & $pgRestore --list $target | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Created dump failed validation" }
} finally {
  $env:PGPASSWORD = $oldPassword
}

$size = (Get-Item -LiteralPath $target).Length
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
Write-Host "[OK] PostgreSQL backup created and validated" -ForegroundColor Green
Write-Host "Path: $target"
Write-Host "Size: $size bytes"
Write-Host "SHA256: $hash"
