$ErrorActionPreference = 'Stop'

function Stop-PortsIfBusy {
    param(
        [int[]]$Ports
    )

    foreach ($port in $Ports) {
        try {
            $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if (-not $connections) {
                Write-Host "Port $port is already free."
                continue
            }

            $owners = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($owner in $owners) {
                try {
                    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Host "Stopping process $owner ($($proc.ProcessName)) on port $port"
                        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
                    }
                }
                catch {
                    Write-Host "Could not stop process $owner on port $port"
                }
            }

            Start-Sleep -Milliseconds 200
            $remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($remaining) {
                Write-Host "Warning: Port $port still has listeners."
            }
            else {
                Write-Host "Port $port is now free."
            }
        }
        catch {
            Write-Host "Port check failed for $port"
        }
    }
}

# Ports used by start-all-rounds.ps1
$roundPorts = @(5000, 8000, 3001, 8001, 5173, 8004, 3000)

Write-Host "Stopping all round servers..."
Stop-PortsIfBusy -Ports $roundPorts
Write-Host "Done."
