@echo off
cd /d "%~dp0"
echo ==========================================
echo   MiMo Cookie Sync
echo ==========================================
echo.
node playwright-cookie.mjs
echo.
pause
