$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localVenvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$workspaceVenvPython = Join-Path (Split-Path $projectRoot -Parent) ".venv\Scripts\python.exe"

if (Test-Path $localVenvPython) {
    $pythonPath = $localVenvPython
} elseif (Test-Path $workspaceVenvPython) {
    $pythonPath = $workspaceVenvPython
} else {
    $pythonCommand = Get-Command python -ErrorAction Stop
    $pythonPath = $pythonCommand.Source
    Write-Warning "No project virtual environment found. Using $pythonPath."
}

Push-Location $projectRoot
try {
    Write-Host "Starting TripMate with $pythonPath"
    & $pythonPath app.py
} finally {
    Pop-Location
}
