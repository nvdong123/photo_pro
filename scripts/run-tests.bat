@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set BACKEND=%ROOT%\backend\photopro
set VENV=%BACKEND%\venv
set PYTHON=%VENV%\Scripts\python.exe
set PYTEST=%VENV%\Scripts\pytest.exe

set PASS_COUNT=0
set FAIL_COUNT=0
set ERROR_COUNT=0
set FAILED_SUITES=

echo ============================================================
echo  PhotoPro - Test Runner
echo ============================================================

:: ── 1. Activate venv ─────────────────────────────────────────
echo.
echo [1/7] Activating virtual environment...
if not exist "%VENV%\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found at %VENV%
    echo         Run scripts\setup-local.bat first.
    exit /b 1
)
call "%VENV%\Scripts\activate.bat"
echo [1/7] venv activated.

:: ── 2. Set environment variables ─────────────────────────────
echo.
echo [2/7] Setting TEST_DATABASE_URL...
set TEST_DATABASE_URL=postgresql+asyncpg://photopro:photopro_dev@localhost:5433/photopro_test
echo [2/7] TEST_DATABASE_URL=%TEST_DATABASE_URL%

:: Change to backend directory so pytest can find app modules
pushd "%BACKEND%"

:: ── 3. Unit tests ─────────────────────────────────────────────
echo.
echo [3/7] Running unit tests...
echo ------------------------------------------------------------
"%PYTEST%" tests/unit/ -v --tb=short --no-cov
set UNIT_EXIT=%ERRORLEVEL%
if %UNIT_EXIT% equ 0 (
    echo [3/7] Unit tests: PASSED
    set /a PASS_COUNT+=1
) else (
    echo.
    echo [ERROR] Unit tests FAILED ^(exit code %UNIT_EXIT%^)
    echo         Fix unit test failures before running integration tests.
    set /a FAIL_COUNT+=1
    set FAILED_SUITES=%FAILED_SUITES% unit
    goto :collect
)

:: ── 4. Integration tests ──────────────────────────────────────
echo.
echo [4/7] Running integration tests...
echo ------------------------------------------------------------
"%PYTEST%" tests/integration/ -v --tb=short --no-cov
set INTEGRATION_EXIT=%ERRORLEVEL%
if %INTEGRATION_EXIT% equ 0 (
    echo [4/7] Integration tests: PASSED
    set /a PASS_COUNT+=1
) else (
    echo.
    echo [ERROR] Integration tests FAILED ^(exit code %INTEGRATION_EXIT%^)
    echo         Fix integration test failures before running e2e tests.
    set /a FAIL_COUNT+=1
    set FAILED_SUITES=%FAILED_SUITES% integration
    goto :collect
)

:: ── 5. E2E tests ──────────────────────────────────────────────
echo.
echo [5/7] Running e2e tests...
echo ------------------------------------------------------------
"%PYTEST%" tests/e2e/ -v --tb=short --no-cov
set E2E_EXIT=%ERRORLEVEL%
if %E2E_EXIT% equ 0 (
    echo [5/7] E2E tests: PASSED
    set /a PASS_COUNT+=1
) else (
    echo.
    echo [ERROR] E2E tests FAILED ^(exit code %E2E_EXIT%^)
    set /a FAIL_COUNT+=1
    set FAILED_SUITES=%FAILED_SUITES% e2e
)

:collect
:: ── 6. Collect total test count ───────────────────────────────
echo.
echo [6/7] Collecting total test count...
echo ------------------------------------------------------------
"%PYTEST%" --co -q 2>&1
echo ------------------------------------------------------------

:: ── 7. Summary ────────────────────────────────────────────────
echo.
echo ============================================================
echo  TEST SUMMARY
echo ============================================================
echo   Suites passed : %PASS_COUNT%
echo   Suites failed : %FAIL_COUNT%
if "%FAILED_SUITES%" neq "" (
    echo   Failed suites :%FAILED_SUITES%
)
echo ============================================================

popd

if %FAIL_COUNT% gtr 0 (
    echo.
    echo [RESULT] FAILED
    endlocal
    exit /b 1
)

echo.
echo [RESULT] ALL TESTS PASSED
endlocal
exit /b 0
