@echo off
echo ==========================================================
echo  Starting Cloud Cost Guardian (PERN + FinOps Stack)
echo ==========================================================

echo [1/3] Installing Backend (apps/api) dependencies...
cd apps\api
call npm install
cd ..\..

echo [2/3] Installing Frontend (apps/web) dependencies...
cd apps\web
call npm install
cd ..\..

echo [3/3] Starting Backend API (port 3000) and Frontend Web (port 5173)...
start cmd /k "cd apps\api && npm run dev"
start cmd /k "cd apps\web && npm run dev"
echo Opened API on http://localhost:3000 and Web UI on http://localhost:5173
