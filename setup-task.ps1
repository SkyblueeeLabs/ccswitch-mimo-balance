# setup-task.ps1 - Create scheduled task for MiMo Cookie auto-refresh
# Usage: powershell -ExecutionPolicy Bypass -File setup-task.ps1
#
# Uses /IT (interactive) flag: the task reuses your current Windows logon
# token, so NO password is needed. It only runs when you are logged on,
# which is exactly what we want (Playwright needs a visible browser).

$taskName = "MiMoCookieAutoRefresh"
$scriptPath = Join-Path $PSScriptRoot "playwright-auto.mjs"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Create MiMo Cookie Auto-Refresh Task" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Task name:  $taskName"
Write-Host "  Script:     $scriptPath"
Write-Host "  Frequency:  Every 6 hours"
Write-Host "  Logon type: Interactive (no password needed)"
Write-Host ""

# Delete old task if it exists
schtasks /Delete /TN "$taskName" /F 2>$null

Write-Host "Creating task..." -ForegroundColor Yellow
Write-Host ""

# /IT = run only when user is logged on, reuses current token (no password)
schtasks /Create `
  /TN "$taskName" `
  /TR "node `"$scriptPath`"" `
  /SC HOURLY `
  /MO 6 `
  /ST 00:00 `
  /IT `
  /F

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "[OK] Task created successfully!" -ForegroundColor Green
  Write-Host ""
  Write-Host "Verify:"
  schtasks /Query /TN "$taskName" /V /FO LIST
} else {
  Write-Host ""
  Write-Host "[ERROR] Task creation failed. Error code: $LASTEXITCODE" -ForegroundColor Red
  Write-Host ""
  Write-Host "Make sure you run this in an elevated (admin) PowerShell."
  Write-Host "If it still fails, use the UAC version: .\elevate.ps1"
}
