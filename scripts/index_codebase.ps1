# Reindex this repository with codebase-memory-mcp.
# https://github.com/DeusData/codebase-memory-mcp

$ErrorActionPreference = "Stop"

$binCandidates = @(
    (Join-Path $env:USERPROFILE ".local\bin\codebase-memory-mcp.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\codebase-memory-mcp\codebase-memory-mcp.exe"),
    "codebase-memory-mcp.exe",
    "codebase-memory-mcp"
)

$bin = $null
foreach ($candidate in $binCandidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $bin = (Get-Command $candidate).Source
        break
    }
    if (Test-Path $candidate) {
        $bin = (Resolve-Path $candidate).Path
        break
    }
}

if (-not $bin) {
    throw "codebase-memory-mcp not found. Install: https://github.com/DeusData/codebase-memory-mcp#quick-start"
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoUnix = $repo -replace "\\", "/"

Write-Host "Using: $bin"
Write-Host "Repo:  $repoUnix"

& $bin config set auto_index true | Out-Host
& $bin config set auto_watch true | Out-Host
& $bin cli index_repository --repo-path $repoUnix --mode fast --name fitness_prog
if ($LASTEXITCODE -ne 0) {
    throw "index_repository failed with exit code $LASTEXITCODE"
}

& $bin cli list_projects
Write-Host "INDEX_OK project=fitness_prog"
