#!/usr/bin/env bash
# Guardian local dev — API (:8080) + app (:5173), /api proxied by Vite.
# Uses whatever Postgres DATABASE_URL points at; Docker only starts if needed.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
[ -f .env ] && . ./.env
set +a

DB_HOST=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

if ! nc -z -G 3 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  if command -v docker >/dev/null 2>&1; then
    docker compose up -d
  else
    echo "ERROR: Postgres not reachable at $DB_HOST:$DB_PORT and Docker not installed." >&2
    exit 1
  fi
fi

trap 'kill 0' EXIT INT TERM
PORT="${API_PORT:-8080}" pnpm --filter @workspace/api-server run dev &
PORT="${PORT:-5173}" pnpm --filter @workspace/brain-app run dev &
wait
