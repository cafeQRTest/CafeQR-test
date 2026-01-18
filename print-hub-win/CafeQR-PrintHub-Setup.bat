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

:: IMPORTANT:
:: %~dp0 ends with "\". Passing it quoted can break argument parsing on some systems.
:: Using "%~dp0." makes it end with "\." instead, which resolves to the same folder. [web:472]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-print-hub.ps1" -RootDir "%~dp0."

echo.
echo Done. You can now close this window.
pause
