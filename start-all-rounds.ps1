$ErrorActionPreference = 'Stop'

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDir,
        [string]$Command
    )

    $psCommand = "Set-Location -LiteralPath '$WorkingDir'; $Command"
    Start-Process powershell -ArgumentList @('-NoExit', '-Command', $psCommand) -WindowStyle Normal
    Write-Host "Started: $Title"
}

function Stop-PortsIfBusy {
    param(
        [int[]]$Ports
    )

    foreach ($port in $Ports) {
        try {
            $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if (-not $connections) { continue }

            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $pids) {
                try {
                    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Host "Stopping process on port ${port}: PID $pid ($($proc.ProcessName))"
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    }
                } catch {
                    Write-Host "Could not stop PID $pid on port ${port}."
                }
            }
        } catch {
            Write-Host "Port check skipped for ${port}."
        }
    }
}

$root = 'C:\Users\Navinkumar\Downloads\Smart'

# Keep ports clean so reruns do not fail with address-in-use errors
Stop-PortsIfBusy -Ports @(5000, 8000, 3001, 8001, 5173, 8004, 3000)

# Python executables
$smartRecruitPython = "$root\SmartRecruit_LLM\.venv311\Scripts\python.exe"
$sharedPython = "$root\.venv\Scripts\python.exe"
$interviewRoundPython = "$root\Interview_round\backend\.venv-ir\Scripts\python.exe"
$dsaPython = "$root\DSA-round-2\Desktop\DSA Round\backend\.venv-dsa\Scripts\python.exe"

# 1) SmartRecruit_LLM (Flask) -> http://127.0.0.1:5000
Start-ServiceWindow -Title 'SmartRecruit_LLM' -WorkingDir "$root\SmartRecruit_LLM" -Command "& '$smartRecruitPython' '.\run.py'"

# 2) MCQ-round backend (FastAPI) -> http://127.0.0.1:8000
Start-ServiceWindow -Title 'MCQ Round Backend' -WorkingDir "$root\MCQ-round\backend" -Command "& '$sharedPython' '.\app.py'"

# 3) MCQ-round frontend (static) -> http://127.0.0.1:3001
Start-ServiceWindow -Title 'MCQ Round Frontend' -WorkingDir "$root\MCQ-round\frontend" -Command "& '$sharedPython' -m http.server 3001"

# 4) DSA Round backend (FastAPI) -> http://127.0.0.1:8001
Start-ServiceWindow -Title 'DSA Round Backend' -WorkingDir "$root\DSA-round-2\Desktop\DSA Round\backend" -Command "& '$dsaPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload"

# 5) DSA Round frontend (Vite) -> http://127.0.0.1:5173
Start-ServiceWindow -Title 'DSA Round Frontend' -WorkingDir "$root\DSA-round-2\Desktop\DSA Round\frontend" -Command "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

# 6) Interview_round backend (FastAPI) -> http://127.0.0.1:8004
Start-ServiceWindow -Title 'Interview_round Backend' -WorkingDir "$root\Interview_round\backend" -Command "& '$interviewRoundPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload"

# 7) Interview_round frontend (Next.js) -> http://127.0.0.1:3000
# Uses NEXT_PUBLIC_API_BASE override to talk to backend on :8004
Start-ServiceWindow -Title 'Interview_round Frontend' -WorkingDir "$root\Interview_round\frontend" -Command "$env:NEXT_PUBLIC_API_BASE='http://127.0.0.1:8004'; npm run dev -- --port 3000"

Write-Host ""
Write-Host "All round services launched in separate terminals."
Write-Host "SmartRecruit_LLM:      http://127.0.0.1:5000"
Write-Host "MCQ Round API:         http://127.0.0.1:8000"
Write-Host "MCQ Round UI:          http://127.0.0.1:3001"
Write-Host "DSA API:               http://127.0.0.1:8001"
Write-Host "DSA UI:                http://127.0.0.1:5173"
Write-Host "Interview_round API:   http://127.0.0.1:8004"
Write-Host "Interview_round UI:    http://127.0.0.1:3000"
