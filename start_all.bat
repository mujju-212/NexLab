@echo off
title NexLab Launcher
echo ====================================================
echo  Starting NexLab Backend and Frontend
echo ====================================================

:: Free ports 5000 and 3000 if occupied
echo Freeing existing processes on ports 5000 and 3000...
powershell -NoProfile -Command "$ports = @(5000, 3000, 3001); foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } } }"

timeout /t 2 /nobreak >nul

:: Start Backend
echo Starting Backend (Flask on http://127.0.0.1:5000)...
start "NexLab Backend [Port 5000]" cmd /k "cd /d "%~dp0backend" && ".\venv\Scripts\python.exe" run.py"

:: Start Frontend
echo Starting Frontend (Next.js on http://localhost:3000)...
start "NexLab Frontend [Port 3000]" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo ====================================================
echo  NexLab services started!
echo  Backend:  http://127.0.0.1:5000
echo  Frontend: http://localhost:3000
echo ====================================================
timeout /t 3
