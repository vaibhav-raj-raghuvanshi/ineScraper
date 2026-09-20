@echo off
title INE Price Tracker - Frontend Dashboard (Port 3000)
echo ======================================================================
echo   Starting Frontend React + Vite Dashboard on http://localhost:3000
echo ======================================================================
cd /d "%~dp0"
call npm run dev:client
pause
