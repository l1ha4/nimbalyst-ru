@echo off
chcp 65001 >nul
echo This mode allows an untested Nimbalyst version after compatibility checks.
echo A backup is created. Use Uninstall.cmd to restore this version.
echo.
choice /C YN /N /M "Install on an untested version? [Y/N] "
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" -Action install -AllowUntested
echo.
pause
