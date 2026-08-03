#!/usr/bin/env bash
# Guardian local dev — API (:8080) + app (:5173), /api proxied by Vite
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
[ -f .env ] && . ./.env
set +a

docker compose up -d

trap 'kill 0' EXIT INT TERM
PORT="${API_PORT:-8080}" pnpm --filter @workspace/api-server run dev &
PORT="${PORT:-5173}" pnpm --filter @workspace/brain-app run dev &
wait
