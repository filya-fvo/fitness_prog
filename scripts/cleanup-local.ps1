[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Deep,
    [ValidateRange(1, 3650)]
    [int]$OlderThanDays = 2
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ProjectPrefix = $ProjectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$Cutoff = (Get-Date).AddDays(-$OlderThanDays)

# These paths are intentionally outside the cleanup scope. Keep this list explicit:
# local data and secrets must never be inferred from age or filename patterns.
$ProtectedRelativePaths = @(
    ".git",
    "AGENTS.md",
    "backend\.env",
    "backend\.env.production",
    "backend\.venv",
    "backups\exercises-dataset-src",
    "backups\vps",
    "docs",
    "frontend\dist",
    "frontend\public",
    "supabase",
    "tools\redis\dump.rdb"
)

$StandardDirectoryCandidates = @(
    ".pytest_cache",
    ".ruff_cache",
    "backend\.pytest_cache",
    "backend\.ruff_cache",
    "frontend\.dist-check",
    "frontend\.dist-next",
    "frontend\test-results",
    "frontend\playwright-report",
    "frontend\artifacts\lighthouse-chrome-profile"
)

$DeepDirectoryCandidates = @(
    ".venv",
    "frontend\node_modules",
    "tools\ngrok"
)

function Resolve-ProjectPath {
    param([Parameter(Mandatory)][string]$RelativePath)

    $resolved = [IO.Path]::GetFullPath((Join-Path $ProjectRoot $RelativePath))
    if (-not $resolved.StartsWith($ProjectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target is outside the project: $resolved"
    }
    if ($resolved.Equals($ProjectRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to target the project root."
    }
    return $resolved
}

function Assert-NotProtected {
    param([Parameter(Mandatory)][string]$Path)

    foreach ($relative in $ProtectedRelativePaths) {
        $protected = Resolve-ProjectPath $relative
        $protectedPrefix = $protected.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if ($Path.Equals($protected, [StringComparison]::OrdinalIgnoreCase) -or
            $Path.StartsWith($protectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean protected path: $Path"
        }
    }

    $relativeToRoot = $Path.Substring($ProjectPrefix.Length)
    if ([IO.Path]::GetFileName($relativeToRoot) -like ".env*") {
        throw "Refusing to clean an environment file: $Path"
    }
}

function Get-PathSize {
    param([Parameter(Mandatory)][string]$Path)

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        return [int64](Get-Item -LiteralPath $Path -Force).Length
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return [int64]0
    }
    $sum = (Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return [int64]0 }
    return [int64]$sum
}

function Test-PathIsStale {
    param([Parameter(Mandatory)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer) {
        return $item.LastWriteTime -lt $Cutoff
    }
    if ($item.LastWriteTime -ge $Cutoff) { return $false }
    $recentChild = Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $Cutoff } |
        Select-Object -First 1
    return $null -eq $recentChild
}

$Candidates = [System.Collections.Generic.List[object]]::new()
function Add-Candidate {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Reason,
        [switch]$IgnoreAge
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = [IO.Path]::GetFullPath($Path)
    Assert-NotProtected $resolved
    if (-not $IgnoreAge -and -not (Test-PathIsStale $resolved)) { return }
    $Candidates.Add([pscustomobject]@{
        Path = $resolved
        Reason = $Reason
        Bytes = Get-PathSize $resolved
    })
}

foreach ($relative in $StandardDirectoryCandidates) {
    Add-Candidate -Path (Resolve-ProjectPath $relative) -Reason "stale cache or test artifact" -IgnoreAge:$Deep
}

Get-ChildItem -LiteralPath (Resolve-ProjectPath "frontend\artifacts") -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "lighthouse-profile-*" } |
    ForEach-Object { Add-Candidate -Path $_.FullName -Reason "stale Lighthouse browser profile" -IgnoreAge:$Deep }

foreach ($relativeRoot in @("backend\app", "backend\scripts", "backend\tests", "scripts")) {
    $scanRoot = Resolve-ProjectPath $relativeRoot
    if (Test-Path -LiteralPath $scanRoot -PathType Container) {
        Get-ChildItem -LiteralPath $scanRoot -Directory -Filter "__pycache__" -Recurse -Force -ErrorAction SilentlyContinue |
            ForEach-Object { Add-Candidate -Path $_.FullName -Reason "stale Python bytecode cache" -IgnoreAge:$Deep }
    }
}

$archivePath = Resolve-ProjectPath "logs\archive"
if (Test-Path -LiteralPath $archivePath -PathType Container) {
    Get-ChildItem -LiteralPath $archivePath -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $Cutoff -and $_.Name -ne ".gitkeep" } |
        ForEach-Object { Add-Candidate -Path $_.FullName -Reason "archived log older than retention" }
}

if ($Deep) {
    $backendPython = Resolve-ProjectPath "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $backendPython -PathType Leaf)) {
        throw "Deep cleanup requires a working backend/.venv; root .venv will not be removed."
    }
    $packageLock = Resolve-ProjectPath "frontend\package-lock.json"
    if (-not (Test-Path -LiteralPath $packageLock -PathType Leaf)) {
        throw "Deep cleanup requires frontend/package-lock.json; node_modules will not be removed."
    }
    foreach ($relative in $DeepDirectoryCandidates) {
        Add-Candidate -Path (Resolve-ProjectPath $relative) -Reason "confirmed replaceable or obsolete local data" -IgnoreAge
    }
}

$ordered = $Candidates | Sort-Object Path -Unique
$totalBytes = [int64](($ordered | Measure-Object -Property Bytes -Sum).Sum)
$mode = if ($Apply) { "APPLY" } else { "DRY RUN" }
Write-Host "[cleanup] Mode: $mode; retention: $OlderThanDays day(s); deep: $($Deep.IsPresent)"
foreach ($candidate in $ordered) {
    $relative = $candidate.Path.Substring($ProjectPrefix.Length)
    Write-Host ("[cleanup] {0,9:N2} MB  {1}  ({2})" -f ($candidate.Bytes / 1MB), $relative, $candidate.Reason)
}
Write-Host ("[cleanup] Candidates: {0}; potential space: {1:N2} MB" -f $ordered.Count, ($totalBytes / 1MB))

if (-not $Apply) {
    Write-Host "[cleanup] Nothing was deleted. Add -Apply after reviewing the list."
    exit 0
}

$deletedBytes = [int64]0
$failures = 0
foreach ($candidate in $ordered) {
    try {
        Assert-NotProtected $candidate.Path
        Remove-Item -LiteralPath $candidate.Path -Recurse -Force -ErrorAction Stop
        $deletedBytes += $candidate.Bytes
    }
    catch {
        $failures += 1
        Write-Warning "Could not remove $($candidate.Path): $($_.Exception.Message)"
    }
}

Write-Host ("[cleanup] Removed approximately {0:N2} MB; failures: {1}" -f ($deletedBytes / 1MB), $failures)
if ($failures -gt 0) { exit 1 }
