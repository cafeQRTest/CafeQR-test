@echo off
title CafeQR Print Hub Setup

:: --- 1) Check if running as administrator ---
net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Requesting administrator rights...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

echo Installing CafeQR Print Hub helper...
echo.

:: --- 2) Run the PowerShell installer with ExecutionPolicy Bypass for this process ---
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-print-hub.ps1"

echo.
echo Done. You can now close this window.
pause
