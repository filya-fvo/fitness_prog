$ErrorActionPreference = "Continue"
$out = "c:\fitness_prog\tools\check-errors.txt"
New-Item -ItemType Directory -Force -Path "c:\fitness_prog\tools" | Out-Null
"" | Set-Content -Path $out -Encoding utf8

function Add-Log([string]$m) {
  Add-Content -Path $out -Value $m -Encoding utf8
}

Add-Log "=== FRONTEND tsc ==="
Push-Location "c:\fitness_prog\frontend"
try {
  & "C:\Program Files\nodejs\npx.cmd" tsc --noEmit --pretty false 2>&1 | Out-String | ForEach-Object { Add-Log $_ }
  Add-Log "tsc_exit=$LASTEXITCODE"
} catch {
  Add-Log "tsc_exception=$_"
}
Pop-Location

Add-Log ""
Add-Log "=== BACKEND pytest telegram ==="
Push-Location "c:\fitness_prog\backend"
try {
  & ".\.venv\Scripts\python.exe" -m pytest tests\test_telegram_bot.py -q 2>&1 | Out-String | ForEach-Object { Add-Log $_ }
  Add-Log "pytest_exit=$LASTEXITCODE"
} catch {
  Add-Log "pytest_exception=$_"
}
Pop-Location

Add-Log ""
Add-Log "=== BACKEND import telegram_bot ==="
try {
  & "c:\fitness_prog\backend\.venv\Scripts\python.exe" -c "from app.services.telegram_bot import build_mini_app_open_url, send_app_notification; print('import_ok', build_mini_app_open_url('https://x.dev', startapp='home'))" 2>&1 | Out-String | ForEach-Object { Add-Log $_ }
} catch {
  Add-Log "import_exception=$_"
}

Add-Log "DONE"
Write-Host "wrote $out"
