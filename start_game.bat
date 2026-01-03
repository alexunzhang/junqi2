@echo off
title Siguo Junqi Server
cd /d "c:\Users\alexu\Documents\Antigravity\junqi2"

echo Starting Siguo Junqi...
echo.
echo 1. The browser will open automatically in 5 seconds.
echo 2. The game server is starting...
echo.

:: Launch a separate mini-process to open the browser after a delay
start /min cmd /c "timeout /t 5 >nul && start "" http://localhost:3000"

:: Start the Next.js development server
npm run dev

pause
