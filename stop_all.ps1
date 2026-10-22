Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Stopping NexLab Backend and Frontend" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$ports = @(5000, 3000, 3001)
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0) {
            Write-Host "Stopping process $($c.OwningProcess) on port $p..." -ForegroundColor Yellow
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}
Write-Host "All NexLab services stopped." -ForegroundColor Green
