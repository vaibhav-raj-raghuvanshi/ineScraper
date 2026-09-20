@echo off
title INE Price Tracker Launcher
:menu
cls
echo ======================================================================
echo          INE Store - Product Price Tracker Control Center
echo ======================================================================
echo.
echo   [1] Run Unit Test Suite (17 Tests)
echo   [2] Run Observable Headed Scraper Demo (Screen Recording)
echo   [3] Start Backend Server (http://localhost:4000)
echo   [4] Start Frontend Dashboard (http://localhost:3000)
echo   [5] Start Both Server and Client (Separate Windows)
echo   [6] Exit
echo.
echo ======================================================================
set /p choice="Select an option (1-6): "

if "%choice%"=="1" goto tests
if "%choice%"=="2" goto headed
if "%choice%"=="3" goto server
if "%choice%"=="4" goto client
if "%choice%"=="5" goto both
if "%choice%"=="6" exit
goto menu

:tests
cls
cd /d "%~dp0"
call npm test
pause
goto menu

:headed
cls
cd /d "%~dp0"
call npm run scrape:headed
pause
goto menu

:server
cls
cd /d "%~dp0"
call npm run dev:server
pause
goto menu

:client
cls
cd /d "%~dp0"
call npm run dev:client
pause
goto menu

:both
cls
echo Launching Backend Server in new window...
start "INE Backend Server" cmd /k "cd /d %~dp0 && npm run dev:server"
echo Launching Frontend Dashboard in new window...
start "INE Frontend Dashboard" cmd /k "cd /d %~dp0 && npm run dev:client"
echo.
echo Both services launched!
echo Server: http://localhost:4000
echo Client: http://localhost:3000
pause
goto menu
