@echo off
cd /d "%~dp0"
echo ==========================================
echo   MiMo Login
echo ==========================================
echo.
echo   A browser will open.
echo   Log in to MiMo, then press ENTER here.
echo.
node playwright-login.mjs
echo.
pause
