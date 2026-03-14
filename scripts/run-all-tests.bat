@echo off
setlocal EnableDelayedExpansion

set SCRIPTS=%~dp0

echo ============================================================
echo  PhotoPro - Full Test Suite
echo ============================================================

:: ── 1. Setup test database ────────────────────────────────────
echo.
echo [1/4] Setting up test database...
call "%SCRIPTS%setup-test-db.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Test DB setup failed. Aborting.
    pause
    exit /b 1
)

:: ── 2. Backend tests ──────────────────────────────────────────
echo.
echo [2/4] Running backend tests...
call "%SCRIPTS%run-tests.bat"
set BE_EXIT=%ERRORLEVEL%
if %BE_EXIT% equ 0 (
    set BE_RESULT=PASSED
) else (
    set BE_RESULT=FAILED
)

:: ── 3. Frontend tests ─────────────────────────────────────────
echo.
echo [3/4] Running frontend tests...
call "%SCRIPTS%run-tests-fe.bat"
set FE_EXIT=%ERRORLEVEL%
if %FE_EXIT% equ 0 (
    set FE_RESULT=PASSED
) else (
    set FE_RESULT=FAILED
)

:: ── 4. Summary ────────────────────────────────────────────────
echo.
echo ============================================================
echo  OVERALL SUMMARY
echo ============================================================
echo   Backend  tests : %BE_RESULT%
echo   Frontend tests : %FE_RESULT%
echo ============================================================

set OVERALL_EXIT=0
if %BE_EXIT% neq 0 set OVERALL_EXIT=1
if %FE_EXIT% neq 0 set OVERALL_EXIT=1

if %OVERALL_EXIT% equ 0 (
    echo   [RESULT] ALL SUITES PASSED
) else (
    echo   [RESULT] ONE OR MORE SUITES FAILED
)
echo ============================================================

pause
endlocal
exit /b %OVERALL_EXIT%
