@echo off
title PLUS EVR ERP Launcher
color 05
cd /d C:\Users\a\Desktop\shoe-factory-app\shoe-factory-app
call npm run build
cd /d C:\Users\a\Desktop\shoe-factory-app\shoe-factory-app\ShoeFactoryApi
dotnet run
pause
