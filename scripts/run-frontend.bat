@echo off
setlocal

set ROOT=%~dp0..
set FRONTEND=%ROOT%\frontend

echo ============================================================
echo  PhotoPro - Frontend only
echo ============================================================

:: ── Check node_modules ────────────────────────────────────────
echo.
if not exist "%FRONTEND%\node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    cd /d "%FRONTEND%"
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: ── Start Vite dev server ─────────────────────────────────────
echo [1/1] Starting frontend (npm run dev) on http://localhost:5173
cd /d "%FRONTEND%"
npm run dev

endlocal
