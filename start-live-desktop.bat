@echo off
title PLUS EVR ERP - Live Railway
color 05
cd /d C:\Users\a\Desktop\shoe-factory-app\shoe-factory-app

call npm.cmd run build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

call npm.cmd exec electron .
pause
