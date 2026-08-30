[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$graphifyVersion = "0.9.52"
$graphifyPackage = "graphifyy[sql]==$graphifyVersion"
$projectRoot = Split-Path -Parent $PSScriptRoot
$constraintsPath = Join-Path $projectRoot "tools\graphify\constraints.lock"

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if ($uvCommand) {
    & $uvCommand.Source tool install $graphifyPackage --constraints $constraintsPath
    if ($LASTEXITCODE -ne 0) {
        throw "Не удалось установить Graphify через uv."
    }
    exit 0
}

$pyCommand = Get-Command py -ErrorAction SilentlyContinue
if (-not $pyCommand) {
    throw "Сначала установите uv: https://docs.astral.sh/uv/getting-started/installation/"
}

& $pyCommand.Source -m uv --version | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Сначала установите uv: https://docs.astral.sh/uv/getting-started/installation/"
}

& $pyCommand.Source -m uv tool install $graphifyPackage --constraints $constraintsPath
if ($LASTEXITCODE -ne 0) {
    throw "Не удалось установить Graphify через py -m uv."
}
