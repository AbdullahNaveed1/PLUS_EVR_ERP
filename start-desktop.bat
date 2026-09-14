@echo off
title PLUS EVR ERP Desktop
color 05
cd /d C:\Users\a\Desktop\shoe-factory-app\shoe-factory-app

call npm.cmd run build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

start "PLUS EVR API" cmd /k "cd /d C:\Users\a\Desktop\shoe-factory-app\shoe-factory-app\ShoeFactoryApi && dotnet run"
call npm.cmd run desktop
pause
