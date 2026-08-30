[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$GraphifyArgs
)

$ErrorActionPreference = "Stop"

$command = Get-Command graphify -ErrorAction SilentlyContinue
if ($command) {
    & $command.Source @GraphifyArgs
    exit $LASTEXITCODE
}

$userBinary = Join-Path $env:USERPROFILE ".local\bin\graphify.exe"
if (Test-Path -LiteralPath $userBinary) {
    & $userBinary @GraphifyArgs
    exit $LASTEXITCODE
}

throw "Graphify не установлен. Запустите .\scripts\install-graphify.ps1"
