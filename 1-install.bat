@echo off
cd /d "%~dp0"
echo ==========================================
echo   MiMo Balance - Install Dependencies
echo ==========================================
echo.
echo   This will install:
echo     1. Playwright (npm package)
echo     2. Chromium browser (Playwright)
echo.
echo   Requirements:
echo     - Node.js 18+ installed
echo     - Internet connection
echo.
pause

echo.
echo [1/2] Installing Playwright...
call npm install -g playwright
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Failed to install Playwright
  pause
  exit /b 1
)
echo [OK] Playwright installed
echo.

echo [2/2] Installing Chromium browser...
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Failed to install Chromium
  pause
  exit /b 1
)
echo [OK] Chromium installed
echo.
echo ==========================================
echo   Installation complete!
echo ==========================================
echo.
echo   Next steps:
echo     1. Double-click login-now.bat to log in
echo     2. Double-click sync-now.bat to sync
echo.
pause
