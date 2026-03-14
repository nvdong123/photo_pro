@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set BACKEND=%ROOT%\backend\photopro
set FRONTEND=%ROOT%\frontend

echo ============================================================
echo  PhotoPro - Starting full local stack
echo ============================================================

:: ── 1. Ensure Docker services are running ────────────────────
echo.
echo [1/4] Checking Docker services...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

docker compose -f "%BACKEND%\docker-compose.yml" ps --services --filter status=running >"%TEMP%\dc_running.txt" 2>nul
set NEED_START=0
for %%s in (postgres redis minio) do (
    findstr /x /i "%%s" "%TEMP%\dc_running.txt" >nul 2>&1
    if errorlevel 1 set NEED_START=1
)

if !NEED_START!==1 (
    echo [1/4] Starting Docker services (postgres, redis, minio)...
    docker compose -f "%BACKEND%\docker-compose.yml" up -d postgres redis minio
    if errorlevel 1 (
        echo [ERROR] Failed to start Docker services.
        pause
        exit /b 1
    )
    echo [1/4] Waiting for services to become healthy...
    timeout /t 8 /nobreak >nul
) else (
    echo [1/4] Docker services already running.
)

:: ── 2. Activate virtual environment ──────────────────────────
echo.
echo [2/4] Activating virtual environment...
if exist "%BACKEND%\venv\Scripts\activate.bat" (
    call "%BACKEND%\venv\Scripts\activate.bat"
) else if exist "%BACKEND%\.venv\Scripts\activate.bat" (
    call "%BACKEND%\.venv\Scripts\activate.bat"
) else (
    echo [WARN] No venv found at %BACKEND%\venv or %BACKEND%\.venv
    echo        Falling back to system Python. Run:
    echo          cd %BACKEND% ^&^& python -m venv venv
    echo          pip install -r requirements.txt
)

:: ── 3. Start uvicorn in a new window ─────────────────────────
echo.
echo [3/4] Starting backend (uvicorn) on port 8000...
set _BE=%BACKEND%
start "PhotoPro Backend" cmd /k "cd /d ""%_BE%"" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: ── 4. Start frontend dev server ─────────────────────────────
echo.
echo [4/4] Starting frontend (npm run dev)...
cd /d "%FRONTEND%"
npm run dev

endlocal
