@echo off
setlocal EnableDelayedExpansion

set ROOT=%~dp0..
set ENV_FILE=%ROOT%\backend\photopro\.env
set BASE_URL=http://localhost:8000
set PASS_COUNT=0
set FAIL_COUNT=0

echo ============================================================
echo  PhotoPro Health Check
echo ============================================================

:: ── Read admin credentials from .env ─────────────────────────
set ADMIN_EMAIL=
set ADMIN_PASSWORD=

if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
        set KEY=%%A
        set VAL=%%B
        set KEY=!KEY: =!
        if /i "!KEY!"=="INITIAL_ADMIN_EMAIL"    set ADMIN_EMAIL=!VAL!
        if /i "!KEY!"=="INITIAL_ADMIN_PASSWORD" set ADMIN_PASSWORD=!VAL!
    )
) else (
    echo [WARN] .env not found at %ENV_FILE% – using defaults
    set ADMIN_EMAIL=admin@photopro.vn
    set ADMIN_PASSWORD=change_me
)

echo Using credentials: !ADMIN_EMAIL!
echo.

:: Helper: curl must be available
where curl >nul 2>&1
if errorlevel 1 (
    echo [ERROR] curl not found. Install curl and add it to PATH.
    pause
    exit /b 1
)

:: ─────────────────────────────────────────────────────────────
:: TEST 1: GET /health → status == "ok"
:: ─────────────────────────────────────────────────────────────
echo [1/3] GET %BASE_URL%/health
set T1_BODY=
for /f "delims=" %%i in ('curl -s -o - -w "%%{http_code}" --max-time 5 "%BASE_URL%/health" 2^>nul') do set T1_BODY=!T1_BODY!%%i

echo        Response: !T1_BODY!
echo !T1_BODY! | findstr /i "\"ok\"" >nul 2>&1
if errorlevel 1 (
    echo        ^=^> FAIL  (expected status "ok" in body)
    set /a FAIL_COUNT+=1
) else (
    echo        => PASS
    set /a PASS_COUNT+=1
)
echo.

:: ─────────────────────────────────────────────────────────────
:: TEST 2: GET /docs → HTTP 200
:: ─────────────────────────────────────────────────────────────
echo [2/3] GET %BASE_URL%/docs
set T2_STATUS=
for /f "delims=" %%i in ('curl -s -o nul -w "%%{http_code}" --max-time 5 "%BASE_URL%/docs" 2^>nul') do set T2_STATUS=%%i

echo        HTTP Status: !T2_STATUS!
if "!T2_STATUS!"=="200" (
    echo        => PASS
    set /a PASS_COUNT+=1
) else (
    echo        ^=^> FAIL  (expected 200, got !T2_STATUS!)
    set /a FAIL_COUNT+=1
)
echo.

:: ─────────────────────────────────────────────────────────────
:: TEST 3: POST /api/v1/admin/auth/login
:: ─────────────────────────────────────────────────────────────
echo [3/3] POST %BASE_URL%/api/v1/admin/auth/login
set LOGIN_PAYLOAD={"email":"!ADMIN_EMAIL!","password":"!ADMIN_PASSWORD!"}
set T3_BODY=
for /f "delims=" %%i in ('curl -s -o - -w "%%{http_code}" --max-time 5 -X POST "%BASE_URL%/api/v1/admin/auth/login" -H "Content-Type: application/json" -d "!LOGIN_PAYLOAD!" 2^>nul') do set T3_BODY=!T3_BODY!%%i

echo        Response: !T3_BODY!
echo !T3_BODY! | findstr /i "access_token" >nul 2>&1
if errorlevel 1 (
    echo        ^=^> FAIL  (no access_token in response)
    set /a FAIL_COUNT+=1
) else (
    echo        => PASS
    set /a PASS_COUNT+=1
)
echo.

:: ─────────────────────────────────────────────────────────────
:: Summary
:: ─────────────────────────────────────────────────────────────
echo ============================================================
echo  Results: !PASS_COUNT! PASS, !FAIL_COUNT! FAIL
echo ============================================================
if !FAIL_COUNT! GTR 0 (
    echo  Overall: FAIL
    exit /b 1
) else (
    echo  Overall: PASS
    exit /b 0
)

endlocal
