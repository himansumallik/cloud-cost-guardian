#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Starting Cloud Cost Guardian (PERN + FinOps Stack)       "
echo "=========================================================="

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "[1/2] Docker detected! Starting PostgreSQL, Express API, and React Web via Docker Compose..."
  docker compose up --build
else
  echo "[1/3] Installing Backend (apps/api) dependencies..."
  (cd apps/api && npm install)
  echo "[2/3] Installing Frontend (apps/web) dependencies..."
  (cd apps/web && npm install)
  echo "[3/3] Starting Express API (port 3000) and React Vite UI (port 5173)..."
  (cd apps/api && npm run dev) &
  API_PID=$!
  trap "kill $API_PID 2>/dev/null || true" EXIT
  (cd apps/web && npm run dev)
fi
