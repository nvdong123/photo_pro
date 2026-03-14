@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set FRONTEND=%ROOT%\frontend

echo ============================================================
echo  PhotoPro - Frontend Test Runner
echo ============================================================

:: ── 1. Navigate to frontend folder ───────────────────────────
echo.
echo [1/4] Changing to frontend directory...
if not exist "%FRONTEND%\package.json" (
    echo [ERROR] package.json not found at %FRONTEND%
    echo         Make sure the frontend folder exists.
    exit /b 1
)
pushd "%FRONTEND%"
echo [1/4] Working directory: %FRONTEND%

:: ── 2. npm install ───────────────────────────────────────────
echo.
echo [2/4] Installing dependencies (npm install)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    exit /b 1
)
echo [2/4] Dependencies ready.

:: ── 3. Run tests with coverage ───────────────────────────────
echo.
echo [3/4] Running Jest tests with coverage...
echo ------------------------------------------------------------
call npm test -- --coverage --watchAll=false
set TEST_EXIT=%ERRORLEVEL%
echo ------------------------------------------------------------

:: ── 4. Coverage summary ───────────────────────────────────────
echo.
echo [4/4] Coverage summary written to: %FRONTEND%\coverage\lcov-report\index.html
echo.

popd

if %TEST_EXIT% neq 0 (
    echo ============================================================
    echo  [RESULT] FAILED  (exit code %TEST_EXIT%)
    echo ============================================================
    endlocal
    exit /b %TEST_EXIT%
)

echo ============================================================
echo  [RESULT] ALL TESTS PASSED
echo ============================================================
endlocal
exit /b 0
