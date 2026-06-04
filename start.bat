@echo off
echo Starting Robot Arm System...

start "Backend" cmd /k "cd /d %~dp0backend && node server.js"

start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host"

start "Mock Inspector" cmd /k "cd /d %~dp0mock-inspector && node server.js"

echo.
echo All services starting in separate windows.
echo   Backend       : http://localhost:3000
echo   Frontend      : http://localhost:5173  (or check Frontend window for LAN IP)
echo   Mock Inspector: http://localhost:8080
echo.
pause
