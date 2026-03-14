@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set BACKEND=%ROOT%\backend\photopro
set COMPOSE_FILE=%BACKEND%\docker-compose.yml

echo ============================================================
echo  PhotoPro - Test Database Setup
echo ============================================================

:: ── 1. Create photopro_test database ─────────────────────────
echo.
echo [1/4] Creating photopro_test database...
set PGPASSWORD=photopro_dev
docker compose -f "%COMPOSE_FILE%" exec -T postgres psql -U photopro -c "CREATE DATABASE photopro_test;" 2>&1
if errorlevel 1 (
    echo [WARN] CREATE DATABASE returned non-zero (database may already exist - continuing)
)
echo [1/4] Done.

:: ── 2. Set DATABASE_URL for test DB ──────────────────────────
echo.
echo [2/4] Setting DATABASE_URL for test DB...
set DATABASE_URL=postgresql+asyncpg://photopro:photopro_dev@localhost:5433/photopro_test
echo [2/4] DATABASE_URL=%DATABASE_URL%

:: ── 3. Run alembic upgrade head against test DB ──────────────
echo.
echo [3/4] Running alembic upgrade head...
pushd "%BACKEND%"
call "%BACKEND%\venv\Scripts\alembic.exe" upgrade head
if errorlevel 1 (
    echo [ERROR] alembic upgrade head failed.
    popd
    pause
    exit /b 1
)
popd
echo [3/4] Migrations applied.

:: ── 4. Done ──────────────────────────────────────────────────
echo.
echo [4/4] Test DB ready
echo.
echo   DSN: %DATABASE_URL%
echo ============================================================
endlocal
