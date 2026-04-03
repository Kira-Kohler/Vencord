@echo off
setlocal enabledelayedexpansion
title Vencord Installer
color 0D

cls
echo.
powershell -NoProfile -NonInteractive -EncodedCommand JABiAD0AQAAoAAoAJwAgAF8AXwAgACAAIAAgACAAIABfAF8AXwBfAF8AXwBfAF8AIABfACAAIAAgAF8AIAAgAF8AXwBfAF8AXwAgAF8AXwBfAF8AIAAgAF8AXwBfAF8AXwAgACAAXwBfAF8AXwBfACAAJwAsAAoAJwAgAFwAIABcACAAIAAgACAALwAgAC8AIAAgAF8AXwBfAF8AfAAgAFwAIAB8ACAAfAAvACAAXwBfAF8AXwAvACAAXwBfACAAXAB8ACAAIABfAF8AIABcAHwAIAAgAF8AXwAgAFwAIAAnACwACgAnACAAIABcACAAXAAgACAALwAgAC8AfAAgAHwAXwBfACAAIAB8ACAAIABcAHwAIAB8ACAAfAAgACAAIAB8ACAAfAAgACAAfAAgAHwAIAB8AF8AXwApACAAfAAgAHwAIAAgAHwAIAB8ACcALAAKACcAIAAgACAAXAAgAFwALwAgAC8AIAB8ACAAIABfAF8AfAAgAHwAIAAuACAAYAAgAHwAIAB8ACAAIAAgAHwAIAB8ACAAIAB8ACAAfAAgACAAXwAgACAALwB8ACAAfAAgACAAfAAgAHwAJwAsAAoAJwAgACAAIAAgAFwAIAAgAC8AIAAgAHwAIAB8AF8AXwBfAF8AfAAgAHwAXAAgACAAfAAgAHwAXwBfAF8AfAAgAHwAXwBfAHwAIAB8ACAAfAAgAFwAIABcAHwAIAB8AF8AXwB8ACAAfAAnACwACgAnACAAIAAgACAAIABcAC8AIAAgACAAfABfAF8AXwBfAF8AXwB8AF8AfAAgAFwAXwB8AFwAXwBfAF8AXwBfAFwAXwBfAF8AXwAvAHwAXwB8ACAAIABcAF8AXABfAF8AXwBfAF8ALwAgACcACgApAAoAJABiACAAfAAgAFcAcgBpAHQAZQAtAEgAbwBzAHQA
echo.
echo                 [ Version by Kira Kohler ]
echo.
echo   ---------------------------------------------------
echo.

call :git_pull
call :check_node
call :check_pnpm
call :install_deps
call :build
call :inject
call :done
exit /b 0


:git_pull
echo.
echo  [~] Updating from repository...
git -C "%~dp0" pull >nul 2>&1
color 0D
if %errorlevel% neq 0 (
    echo  [!] git pull failed. Continuing with current version.
) else (
    echo  [+] Up to date.
)
exit /b 0


:check_node
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
    echo  [+] Node.js !NODE_VERSION! found.
    exit /b 0
)

echo  [!] Node.js not found. Attempting to install...
echo.

where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo  [~] Installing via winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements >nul 2>&1
    color 0D
    if %errorlevel% equ 0 (
        echo  [+] Node.js installed. Restarting...
        timeout /t 2 /nobreak >nul
        start "" "%~f0"
        exit
    )
)

echo  [~] winget not available or failed. Trying PowerShell download...
echo.
set NODE_MSI=%TEMP%\node_installer.msi
powershell -NoProfile -NonInteractive -Command ^
    "try { $v = (Invoke-WebRequest 'https://nodejs.org/dist/latest-lts/SHASUMS256.txt' -UseBasicParsing).Content -split \"`n\" | Where-Object { $_ -match 'node-v[\d.]+-x64\.msi' } | Select-Object -First 1; $ver = ($v -split '-')[1]; Invoke-WebRequest \"https://nodejs.org/dist/$ver/node-$ver-x64.msi\" -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { exit 1 }"
color 0D
if %errorlevel% neq 0 (
    echo.
    echo  [X] Could not download Node.js automatically.
    echo.
    echo      Please install it manually from: https://nodejs.org
    echo      Then run this installer again.
    echo.
    pause
    exit /b 1
)

echo  [~] Running Node.js installer...
msiexec /i "%NODE_MSI%" /quiet /norestart
color 0D
if %errorlevel% neq 0 (
    echo  [X] Node.js installation failed. Please install manually from https://nodejs.org
    pause
    exit /b 1
)
del "%NODE_MSI%" >nul 2>&1
echo  [+] Node.js installed. Restarting...
timeout /t 2 /nobreak >nul
start "" "%~f0"
exit


:check_pnpm
echo.
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
    echo  [+] pnpm found.
    exit /b 0
)
echo  [!] pnpm not found. Installing...
call npm install -g pnpm >nul 2>&1
color 0D
if %errorlevel% neq 0 (
    echo  [X] Failed to install pnpm.
    pause
    exit /b 1
)
echo  [+] pnpm installed.
exit /b 0


:install_deps
echo.
echo  [~] Installing dependencies...
call pnpm install --frozen-lockfile >nul 2>&1
if %errorlevel% neq 0 (
    call pnpm install >nul 2>&1
    color 0D
    if %errorlevel% neq 0 (
        echo  [X] Failed to install dependencies.
        pause
        exit /b 1
    )
)
color 0D
echo  [+] Dependencies installed.
exit /b 0


:build
echo.
echo  [~] Building Vencord...
call pnpm build >nul 2>&1
color 0D
if %errorlevel% neq 0 (
    echo  [X] Build failed. Run "pnpm build" manually to see errors.
    pause
    exit /b 1
)
echo  [+] Build complete.
exit /b 0


:inject
echo.
echo  [~] Closing Discord if running...
for %%p in (Discord.exe DiscordCanary.exe DiscordPTB.exe DiscordDevelopment.exe) do (
    taskkill /f /im %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo  [+] Discord closed.

echo.
echo  [~] Injecting into Discord...

set INSTALLER_DIR=%~dp0dist\Installer
set INSTALLER_EXE=%INSTALLER_DIR%\VencordInstallerCli.exe
set INSTALLER_URL=https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe

if not exist "%INSTALLER_DIR%" mkdir "%INSTALLER_DIR%"

if not exist "%INSTALLER_EXE%" (
    echo  [~] Downloading Vencord installer...
    powershell -NoProfile -NonInteractive -Command ^
        "try { Invoke-WebRequest -Uri '%INSTALLER_URL%' -OutFile '%INSTALLER_EXE%' -UseBasicParsing; exit 0 } catch { Write-Host '     Error:' $_.Exception.Message; exit 1 }"
    color 0D
    if %errorlevel% neq 0 (
        echo  [X] Could not download the Vencord installer.
        echo      Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  [+] Installer downloaded.
)

set "VENCORD_USER_DATA_DIR=%~dp0"
set "VENCORD_DEV_INSTALL=1"

for %%b in (stable ptb canary) do (
    set BRANCH_LABEL=Discord %%b
    if /i "%%b"=="stable" set BRANCH_LABEL=Discord Stable
    if /i "%%b"=="ptb" set BRANCH_LABEL=Discord PTB
    if /i "%%b"=="canary" set BRANCH_LABEL=Discord Canary
    "%INSTALLER_EXE%" -install -branch %%b >nul 2>&1
    if !errorlevel! equ 0 (
        echo  [+] Injected into !BRANCH_LABEL!.
    )
)
color 0D
exit /b 0


:done
echo.
echo   ---------------------------------------------------
echo.
echo              Installation complete!
echo.
echo   ---------------------------------------------------
echo.
pause
exit /b 0
