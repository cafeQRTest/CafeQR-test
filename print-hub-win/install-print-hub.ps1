param(
  [int]$Port      = 3333,
  [string]$TaskName = "CafeQR Print Hub"
)

$ErrorActionPreference = 'Stop'

# Full path to print-hub.ps1 in the same folder
$scriptPath = Join-Path $PSScriptRoot "print-hub.ps1"
if (-not (Test-Path $scriptPath)) {
  Write-Error "Cannot find print-hub.ps1 next to install-print-hub.ps1"
  exit 1
}

# --- 1) Relax ExecutionPolicy only for this user (best-effort) --------------
try {
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
} catch {
  Write-Warning "Could not set execution policy for current user: $($_.Exception.Message)"
}

# --- 2) Create Startup shortcut (works on all supported Windows versions) ---
try {
  $startupDir = [Environment]::GetFolderPath('Startup')
  if (-not (Test-Path $startupDir)) {
    New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
  }

  $wsh        = New-Object -ComObject WScript.Shell
  $lnkPath    = Join-Path $startupDir "CafeQR Print Hub.lnk"
  $targetExe  = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments  = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`" -Port $Port"

  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath       = $targetExe
  $shortcut.Arguments        = $arguments
  $shortcut.WorkingDirectory = Split-Path $scriptPath
  $shortcut.WindowStyle      = 7   # Minimized
  $shortcut.IconLocation     = "$env:SystemRoot\System32\shell32.dll,277"
  $shortcut.Save()

  Write-Host "[Startup] Shortcut created: $lnkPath"
  Write-Host "Print Hub will start automatically whenever this user logs in."
} catch {
  Write-Warning "Could not create Startup shortcut: $($_.Exception.Message)"
}

# --- 3) Optional: Scheduled Task (Windows 8+ with ScheduledTasks module) ----
if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) {
  try {
    $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger  = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Register-ScheduledTask `
      -TaskName  $TaskName `
      -Action    $action `
      -Trigger   $trigger `
      -Settings  $settings `
      -RunLevel  Highest `
      -Force | Out-Null

    try { Start-ScheduledTask -TaskName $TaskName | Out-Null } catch { }

    Write-Host "[Task] $TaskName installed."
  } catch {
    Write-Warning "Failed to create scheduled task: $($_.Exception.Message)"
  }
} else {
  Write-Host "ScheduledTasks module not available; using only Startup shortcut."
}

# --- 4) Start once immediately so helper is live right away -----------------
try {
  Start-Process "powershell.exe" $arguments -WindowStyle Hidden
  Write-Host "CafeQR Print Hub started for this session."
} catch {
  Write-Warning "Could not start print-hub.ps1 immediately: $($_.Exception.Message)"
}
