#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$DumpPath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $DumpPath)) { throw "Dump not found: $DumpPath" }
$DumpPath = (Resolve-Path -LiteralPath $DumpPath).Path

function Convert-PostgresUrl([string]$Url) {
  $normalized = $Url.Trim() -replace '^postgresql\+asyncpg://', 'postgresql://'
  $uri = [Uri]$normalized
  $userinfo = $uri.UserInfo
  $separator = $userinfo.IndexOf(':')
  if ($separator -lt 0) { throw "Timeweb URL must include a password" }
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

$secureUrl = Read-Host "Paste the Timeweb PostgreSQL connection URL (input is hidden)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
try {
  $plainUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $parts = Convert-PostgresUrl $plainUrl
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $plainUrl = $null
}
if ($parts.Host -in @("localhost", "127.0.0.1", "::1")) {
  throw "Target must be the remote Timeweb PostgreSQL database"
}

$psql = Find-PostgresTool "psql"
$pgRestore = Find-PostgresTool "pg_restore"
if (-not $psql -or -not $pgRestore) { throw "PostgreSQL psql/pg_restore not found" }

$old = @{
  PGHOST = $env:PGHOST
  PGPORT = $env:PGPORT
  PGDATABASE = $env:PGDATABASE
  PGUSER = $env:PGUSER
  PGPASSWORD = $env:PGPASSWORD
  PGSSLMODE = $env:PGSSLMODE
}
try {
  $env:PGHOST = $parts.Host
  $env:PGPORT = $parts.Port
  $env:PGDATABASE = $parts.Database
  $env:PGUSER = $parts.User
  $env:PGPASSWORD = $parts.Password
  $env:PGSSLMODE = "require"

  $tableCount = (& $psql -X -tAc `
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" |
    Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Cannot connect to Timeweb PostgreSQL" }
  if ($tableCount -ne "0") {
    throw "Target database is not empty ($tableCount public tables). Import stopped without changes."
  }

  & $pgRestore `
    --exit-on-error `
    --no-owner `
    --no-privileges `
    --dbname $parts.Database `
    $DumpPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with code $LASTEXITCODE" }
} finally {
  foreach ($name in $old.Keys) {
    Set-Item -Path "Env:$name" -Value $old[$name] -ErrorAction SilentlyContinue
  }
}

Write-Host "[OK] PostgreSQL data restored to Timeweb" -ForegroundColor Green
Write-Host "The connection URL was used only in memory and was not saved."

