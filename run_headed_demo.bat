@echo off
title Running Observable Headed Scraper Demo
echo ======================================================================
echo   INE Store - Observable Headed Scraper (Video Recording Mode)
echo ======================================================================
echo   Launches visible Chromium browser with slowMo.
echo   Simulates network failure on Attempt 1, triggers backoff, recovers on Attempt 2.
echo ======================================================================
cd /d "%~dp0"
call npm run scrape:headed
echo.
pause
