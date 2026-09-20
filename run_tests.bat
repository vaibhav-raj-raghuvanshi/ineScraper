@echo off
title Running INE Scraper Unit Test Suite
echo ======================================================================
echo   Running INE Scraper Unit Test Suite (17 Tests)
echo ======================================================================
cd /d "%~dp0"
call npm test
echo.
pause
