param(
  [int]$Port = 3333,
  [string]$TaskName = "CafeQR Print Hub"
)

# Full path to print-hub.ps1 in the same folder
$scriptPath = Join-Path $PSScriptRoot "print-hub.ps1"

if (-not (Test-Path $scriptPath)) {
  Write-Error "Cannot find print-hub.ps1 next to install-print-hub.ps1"
  exit 1
}

# Allow scripts for current user (once)
try {
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
} catch {
  Write-Warning "Could not set execution policy for current user: $($_.Exception.Message)"
}

# Action: run PowerShell hidden and start print-hub.ps1
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`" -Port $Port"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments

# Trigger: at logon for the current user
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings: restart if it fails, keep running
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

try {
  # Create or update the scheduled task
  $task = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force

  # Start it once now so the helper is live immediately
  try {
    Start-ScheduledTask -TaskName $TaskName | Out-Null
  } catch {
    Write-Warning "Task was created but could not be started immediately: $($_.Exception.Message)"
  }

  Write-Host "[$TaskName] installed."
  Write-Host "Print Hub will start automatically whenever you log in."
  Write-Host "It listens on http://127.0.0.1:$Port/"
} catch {
  Write-Error "Failed to create scheduled task: $($_.Exception.Message)"
}
