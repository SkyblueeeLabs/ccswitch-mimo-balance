@echo off
REM ============================================================
REM  4-setup-task.bat
REM  Double-click to create the auto-refresh scheduled task.
REM  A UAC prompt will appear - click YES. No password needed.
REM ============================================================

cd /d "%~dp0"

REM Request UAC elevation, then run setup-task.ps1
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0setup-task.ps1\"'"

echo.
echo ==========================================
echo  Task Info
echo ==========================================
schtasks /Query /TN "MiMoCookieAutoRefresh" /V /FO LIST
echo.
pause
