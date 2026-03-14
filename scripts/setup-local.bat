@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set BACKEND=%ROOT%\backend\photopro
set COMPOSE_FILE=%BACKEND%\docker-compose.yml

echo ============================================================
echo  PhotoPro - Local Environment Setup
echo ============================================================

:: ── 1. Check Docker ───────────────────────────────────────────
echo.
echo [1/8] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first, then re-run this script.
    pause
    exit /b 1
)
echo [1/8] Docker is running.

:: ── 2. Copy .env.example → .env ──────────────────────────────
echo.
echo [2/8] Checking .env file...
if not exist "%BACKEND%\.env" (
    if not exist "%BACKEND%\.env.example" (
        echo [ERROR] .env.example not found at %BACKEND%\.env.example
        pause
        exit /b 1
    )
    copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
    echo [2/8] Created .env from .env.example — review and update secrets before production use.
) else (
    echo [2/8] .env already exists, skipping.
)

:: ── 3. Create upload folder ───────────────────────────────────
echo.
echo [3/8] Ensuring upload folder exists...
if not exist "C:\photopro_upload" (
    mkdir "C:\photopro_upload"
    echo [3/8] Created C:\photopro_upload
) else (
    echo [3/8] C:\photopro_upload already exists.
)

:: ── 4. Start Docker services ──────────────────────────────────
echo.
echo [4/8] Starting Docker services (postgres, redis, minio)...
docker compose -f "%COMPOSE_FILE%" up -d postgres redis minio
if errorlevel 1 (
    echo [ERROR] Failed to start Docker services.
    pause
    exit /b 1
)
echo [4/8] Services started.

:: ── 5. Wait for postgres healthy ──────────────────────────────
echo.
echo [5/8] Waiting for PostgreSQL to become ready...
set RETRIES=15
set /a RETRIES_LEFT=%RETRIES%
:pg_wait_loop
docker compose -f "%COMPOSE_FILE%" exec -T postgres pg_isready -U photopro >nul 2>&1
if not errorlevel 1 (
    echo [5/8] PostgreSQL is ready.
    goto pg_ready
)
set /a RETRIES_LEFT-=1
if !RETRIES_LEFT! LEQ 0 (
    echo [ERROR] PostgreSQL did not become ready after %RETRIES% attempts.
    echo         Check logs: docker compose -f "%COMPOSE_FILE%" logs postgres
    pause
    exit /b 1
)
echo        Not ready yet, retrying in 2s... (attempts left: !RETRIES_LEFT!)
timeout /t 2 /nobreak >nul
goto pg_wait_loop
:pg_ready

:: ── 6. Create venv and install dependencies ───────────────────
echo.
echo [6/8] Setting up Python virtual environment...
if not exist "%BACKEND%\venv" (
    echo        Creating venv...
    python -m venv "%BACKEND%\venv"
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Ensure Python 3.11+ is installed.
        pause
        exit /b 1
    )
)
call "%BACKEND%\venv\Scripts\activate.bat"
echo        Installing dependencies...
pip install -r "%BACKEND%\requirements.txt" --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)
echo [6/8] Dependencies installed.

:: ── 7. Run Alembic migrations ─────────────────────────────────
echo.
echo [7/8] Running database migrations (alembic upgrade head)...
cd /d "%BACKEND%"
alembic upgrade head
if errorlevel 1 (
    echo [ERROR] Alembic migration failed.
    echo.
    echo  Troubleshooting steps:
    echo    1. Check current heads:  alembic heads
    echo    2. Check history:        alembic history
    echo    3. Check DB connection in .env (DATABASE_URL)
    echo    4. Ensure postgres container is running: docker compose ps
    pause
    exit /b 1
)
echo [7/8] Migrations applied.

:: ── 8. Seed database ──────────────────────────────────────────
echo.
echo [8/8] Seeding database...
python -m app.database.seed
if errorlevel 1 (
    echo [WARN] Seed script returned an error (may be safe if already seeded).
)
echo [8/8] Seed complete.

:: ── Done ──────────────────────────────────────────────────────
echo.
echo ============================================================
echo  Setup complete! Next steps:
echo.
echo  Start backend:   scripts\run-backend.bat
echo  Start frontend:  scripts\run-frontend.bat
echo  Start both:      scripts\run-local.bat
echo  Health check:    scripts\health-check.bat
echo ============================================================
echo.
pause
endlocal
