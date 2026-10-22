@echo off
title Stop NexLab Services
echo ====================================================
echo  Stopping NexLab Backend and Frontend
echo ====================================================
powershell -NoProfile -Command "$ports = @(5000, 3000, 3001); foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped process ' + $c.OwningProcess + ' on port ' + $p) } } }"
echo All NexLab services on ports 5000 and 3000 stopped.
timeout /t 3
