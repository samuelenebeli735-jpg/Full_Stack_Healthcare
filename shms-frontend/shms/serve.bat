@echo off
title SHMS - Network Server
echo ============================================
echo   SHMS - Student Health Management System
echo   Starting network server...
echo ============================================
echo.

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do set IP=%%a
set IP=%IP: =%

echo Your local IP address: %IP%
echo.
echo Other devices can access the site at:
echo   http://%IP%:8080
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Try Python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [Using Python HTTP server]
    cd /d "%~dp0"
    python -m http.server 8080 --bind 0.0.0.0
    goto :end
)

REM Try Node.js
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [Using Node.js http-server]
    cd /d "%~dp0"
    npx http-server -a 0.0.0.0 -p 8080 --cors
    goto :end
)

echo ERROR: Neither Python nor Node.js found.
echo Please install Python or Node.js, then run this script again.
pause

:end
