param([Parameter(Mandatory=$true)][string[]]$Paths)
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "backend"))) { $root = "C:\fitness_prog" }
$bak = Join-Path $root "backups\$ts"
New-Item -ItemType Directory -Force -Path $bak | Out-Null
foreach ($p in $Paths) {
  $src = if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $root $p }
  if (-not (Test-Path $src)) { Write-Host "skip missing $p"; continue }
  $rel = $src.Substring($root.Length).TrimStart("\","/")
  $dest = Join-Path $bak $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item $src $dest -Force
  Write-Host "backed up $rel"
}
Write-Host "Backup dir: $bak"
