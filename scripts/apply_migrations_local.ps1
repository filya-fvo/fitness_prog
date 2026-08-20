# Apply Supabase SQL migrations to local PostgreSQL.
# If pgvector is not installed on the host, uses a local fallback for exercises.embedding.
# Production/Supabase must use the original migrations with vector(1536).

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
$migrationsDir = Join-Path $root "supabase\migrations"
$psqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue
if ($psqlCommand) {
    $psql = $psqlCommand.Source
}
else {
    $psql = Get-ChildItem (Join-Path $env:ProgramFiles "PostgreSQL\*\bin\psql.exe") -ErrorAction SilentlyContinue |
        Sort-Object { [int]$_.Directory.Parent.Name } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
if (-not $psql -or -not (Test-Path $psql)) {
    throw "psql not found. Install PostgreSQL command-line tools or run install-server.cmd."
}

function Get-EnvValue([string]$Path, [string]$Key) {
    $line = Get-Content $Path | Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } | Select-Object -First 1
    if (-not $line) { return $null }
    return $line.Substring($Key.Length + 1).Trim()
}

function Convert-AsyncPgUrlToParts([string]$Url) {
    $normalized = $Url.Trim().Trim('"').Trim("'")
    $normalized = $normalized -replace "^postgresql\+asyncpg://", "postgresql://"
    $normalized = $normalized -replace "^postgres\+asyncpg://", "postgresql://"

    try {
        $uri = [System.Uri]$normalized
    }
    catch {
        throw "Cannot parse DATABASE_URL as URI. If password has special chars, URL-encode them (@ -> %40, : -> %3A, / -> %2F, # -> %23)."
    }

    $userInfo = $uri.UserInfo
    if (-not $userInfo) { throw "DATABASE_URL has no user info" }

    $user = $userInfo
    $pass = ""
    $colon = $userInfo.IndexOf(":")
    if ($colon -ge 0) {
        $user = [System.Uri]::UnescapeDataString($userInfo.Substring(0, $colon))
        $pass = [System.Uri]::UnescapeDataString($userInfo.Substring($colon + 1))
    }
    else {
        $user = [System.Uri]::UnescapeDataString($userInfo)
    }

    $dbName = $uri.AbsolutePath.Trim("/")
    if (-not $dbName) { throw "DATABASE_URL has no database name" }

    $port = $uri.Port
    if ($port -lt 0) { $port = 5432 }

    return [pscustomobject]@{
        User = $user
        Password = $pass
        Host = $uri.Host
        Port = "$port"
        Database = $dbName
    }
}

$dbUrl = Get-EnvValue $envFile "DATABASE_URL"
if (-not $dbUrl) { throw "DATABASE_URL missing in backend/.env" }

$parts = Convert-AsyncPgUrlToParts $dbUrl
$env:PGUSER = $parts.User
$env:PGPASSWORD = $parts.Password
$env:PGHOST = $parts.Host
$env:PGPORT = $parts.Port
$db = $parts.Database

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$SqlArgs
    )
    & $psql -d $Database -v ON_ERROR_STOP=1 @SqlArgs
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed ($LASTEXITCODE) db=$Database args=$($SqlArgs -join ' ')"
    }
}

function Get-PsqlText {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$Query
    )
    $raw = & $psql -d $Database -tAc $Query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql query failed ($LASTEXITCODE): $raw"
    }
    if ($null -eq $raw) { return "" }
    return ($raw | Out-String).Trim()
}

Write-Host "Connecting $($parts.User)@$($parts.Host):$($parts.Port)/$db"

$dbExists = Get-PsqlText -Database "postgres" -Query "SELECT 1 FROM pg_database WHERE datname='$db'"
if ($dbExists -ne "1") {
    Write-Host "Creating database $db"
    Invoke-Psql -Database "postgres" -SqlArgs @("-c", "CREATE DATABASE `"$db`";")
}

$hasVector = Get-PsqlText -Database $db -Query "SELECT 1 FROM pg_available_extensions WHERE name='vector'"
$useVectorFallback = ($hasVector -ne "1")
if ($useVectorFallback) {
    Write-Host "WARNING: extension 'vector' is not installed on this PostgreSQL."
    Write-Host "         Applying local fallback for exercises.embedding (double precision[])."
    Write-Host "         For production/RAG use Supabase or install pgvector."
}
else {
    Write-Host "pgvector available"
}

$files = Get-ChildItem $migrationsDir -Filter "*.sql" | Sort-Object Name
foreach ($file in $files) {
    Write-Host "APPLY $($file.Name)"
    $sql = Get-Content $file.FullName -Raw

    if ($useVectorFallback) {
        if ($file.Name -like "*extensions*") {
            $sql = $sql -replace '(?m)^\s*CREATE EXTENSION IF NOT EXISTS "vector";\s*\r?$', "-- skipped locally: vector not installed`r`n"
        }
        if ($file.Name -like "*exercises*") {
            $sql = $sql -replace "embedding vector\(1536\)", "embedding double precision[]"
            $sql = $sql -replace "(?s)CREATE INDEX IF NOT EXISTS idx_exercises_embedding_hnsw.*?vector_cosine_ops\);\r?\n", "-- skipped locally: HNSW/vector index`r`n"
        }
    }

    $tmp = Join-Path $env:TEMP ("fitness_mig_" + $file.Name)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp, $sql, $utf8NoBom)
    try {
        Invoke-Psql -Database $db -SqlArgs @("-f", $tmp)
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "=== VERIFY ==="
Invoke-Psql -Database $db -SqlArgs @("-c", "\dt")
& $psql -d $db -c "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm','pgcrypto','uuid-ossp') ORDER BY 1;"
& $psql -d $db -c "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='exercises' AND column_name='embedding';"
& $psql -d $db -c "SELECT indexname FROM pg_indexes WHERE tablename='nutrition_products' AND indexname LIKE '%trgm%';"
Write-Host "MIGRATIONS_APPLIED_OK"
