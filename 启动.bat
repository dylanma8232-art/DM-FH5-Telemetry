@echo off
title FH5 Telemetry Dashboard
chcp 65001 > nul
echo ==========================================
echo   FH5 遥测仪表盘 - 一键启动 (Windows)
echo   仅启动后端服务，端口 9188
echo ==========================================
echo.

cd /d "%~dp0\forza-telemetry"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

if not exist "server\node_modules\" (
    echo [安装] 后端依赖...
    cd server && call npm install --prefer-offline && cd ..
)

echo [启动] http://localhost:9188
timeout /t 2 /nobreak >nul
start "" "http://localhost:9188"
cd server && npm start
