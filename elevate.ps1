# elevate.ps1 - ASCII only to avoid encoding issues
# Creates scheduled task with UAC elevation (no password needed)

$taskName = "MiMoCookieAutoRefresh"
$scriptPath = "D:\Project\Personal-Code\Demo-Other\mimo-balance\playwright-auto.mjs"

# Delete old task
schtasks /Delete /TN "$taskName" /F 2>$null

# Build the schtasks command
$cmd = "schtasks /Create /TN `"$taskName`" /TR `"node `"$scriptPath`"`" /SC HOURLY /MO 6 /ST 00:00 /RL HIGHEST /F"

Write-Host ""
Write-Host "Creating scheduled task (UAC prompt will appear)..." -ForegroundColor Yellow
Write-Host "Click YES on the UAC dialog." -ForegroundColor Yellow
Write-Host ""

# Elevate via UAC
Start-Process cmd -Verb RunAs -ArgumentList "/c $cmd"

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "Verifying task..."
schtasks /Query /TN "$taskName" /V /FO LIST
