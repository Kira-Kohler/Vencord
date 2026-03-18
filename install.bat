@echo off
setlocal enabledelayedexpansion
title Vencord Installer
color 0D

echo ============================================
echo           Vencord Auto Installer
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Installing...
    echo.

    where winget >nul 2>&1
    if %errorlevel% neq 0 (
        echo [X] winget not available. Please install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )

    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [X] Failed to install Node.js. Please install it manually from https://nodejs.org
        pause
        exit /b 1
    )

    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    echo [OK] Node.js installed.
    echo [!] You may need to restart this script for PATH changes to take effect.
    echo.
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
echo [OK] Node.js %NODE_VERSION% detected.

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] pnpm not found. Installing...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [X] Failed to install pnpm.
        pause
        exit /b 1
    )
    echo [OK] pnpm installed.
)

echo.
echo [*] Installing dependencies...
call pnpm install --frozen-lockfile
if %errorlevel% neq 0 (
    call pnpm install
    if %errorlevel% neq 0 (
        echo [X] Failed to install dependencies.
        pause
        exit /b 1
    )
)
echo [OK] Dependencies installed.

echo.
echo [*] Building Vencord...
call pnpm build
if %errorlevel% neq 0 (
    echo [X] Build failed.
    pause
    exit /b 1
)
echo [OK] Build complete.
echo.
echo [*] Injecting into Discord...
call pnpm inject
echo.
echo ============================================
echo           Installation complete!
echo ============================================
echo Restart Discord to apply changes.
echo.
pause
