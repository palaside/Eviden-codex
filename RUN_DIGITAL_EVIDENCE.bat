@echo off
title DIGITAL EVIDENCE - Forensic Court Suite Launcher
chcp 65001 >nul
cls

echo ==============================================================================
echo  🏛️ DIGITAL EVIDENCE — All-Skills Unified Forensic Evidence Suite
echo ==============================================================================
echo.
echo [1/3] Checking environment...
cd /d "%~dp0"

if not exist "node_modules" (
    echo [2/3] Installing dependencies...
    call npm install
) else (
    echo [2/3] Dependencies verified.
)

echo [3/3] Launching Digital Evidence Suite on port 3450 (Enterprise build)...
start http://127.0.0.1:3450

call npm run start -- --port 3450
pause
