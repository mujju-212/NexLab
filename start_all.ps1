Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Starting NexLab Backend and Frontend" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Stop any stale processes on 5000 and 3000
$ports = @(5000, 3000, 3001)
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0) {
            Write-Host "Stopping existing process $($c.OwningProcess) on port $p..." -ForegroundColor Yellow
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 2

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

# 2. Launch Backend in new window
Write-Host "Launching Backend on http://127.0.0.1:5000..." -ForegroundColor Green
Start-Process cmd.exe -ArgumentList "/k", "title NexLab Backend [Port 5000] && cd /d `"$backendDir`" && `"$pythonExe`" run.py"

# 3. Launch Frontend in new window
Write-Host "Launching Frontend on http://localhost:3000..." -ForegroundColor Green
Start-Process cmd.exe -ArgumentList "/k", "title NexLab Frontend [Port 3000] && cd /d `"$frontendDir`" && npm run dev"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Both servers launched in separate console windows!" -ForegroundColor Green
Write-Host " Backend:  http://127.0.0.1:5000" -ForegroundColor White
Write-Host " Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Cyan
