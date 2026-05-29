@echo off
cd /d "%~dp0"
title 订单流程体系优化
echo ═══════════════════════════════════
echo   订单流程体系优化 — 启动服务
echo ═══════════════════════════════════
echo.

if not exist "node_modules\express" (
  echo 📦 正在安装依赖（首次启动需要）...
  call npm install
)
echo.
node start.js
pause
