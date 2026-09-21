param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "frontend/public/exercise-gifs"))
$targetDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "frontend/public/exercise-thumbnails"))

if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
  throw "Exercise GIF directory not found: $sourceDir"
}

[System.IO.Directory]::CreateDirectory($targetDir) | Out-Null
$created = 0
$skipped = 0

# Windows wildcard matching treats "*.gif" as matching names such as
# "exercise.gif_bk" too. Check the actual extension so rejected backup files
# cannot silently recreate stale thumbnails.
Get-ChildItem -LiteralPath $sourceDir -File |
  Where-Object { $_.Extension -ieq ".gif" } |
  ForEach-Object {
  $output = Join-Path $targetDir ($_.BaseName + ".png")
  if (-not $Force -and (Test-Path -LiteralPath $output) -and
      (Get-Item -LiteralPath $output).LastWriteTimeUtc -ge $_.LastWriteTimeUtc) {
    $skipped += 1
    return
  }

  $image = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    $frame = New-Object System.Drawing.Bitmap($image.Width, $image.Height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($frame)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)
      } finally {
        $graphics.Dispose()
      }
      $frame.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $frame.Dispose()
    }
  } finally {
    $image.Dispose()
  }
  $created += 1
  }

Write-Output "Exercise thumbnails: created=$created skipped=$skipped target=$targetDir"
