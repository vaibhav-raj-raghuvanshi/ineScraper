@echo off
title INE Price Tracker - Backend Server (Port 4000)
echo ======================================================================
echo   Starting Backend Express API & Scraper Server on http://localhost:4000
echo ======================================================================
cd /d "%~dp0"
call npm run dev:server
pause
