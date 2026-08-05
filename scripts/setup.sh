#!/usr/bin/env bash
# Guardian local setup — one command: pnpm setup
# Works with EITHER a native Postgres (e.g. the Mini) or Docker (e.g. the laptop).
# DATABASE_URL decides; Docker only starts when nothing answers at that address.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — paste your Gemini key into AI_INTEGRATIONS_GEMINI_API_KEY"
fi
set -a
. ./.env
set +a

# 2. Postgres — use what's already running; Docker is the fallback, not a requirement
DB_HOST=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

if nc -z -G 3 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  echo "Postgres already reachable at $DB_HOST:$DB_PORT — using it (no Docker)."
elif command -v docker >/dev/null 2>&1; then
  docker compose up -d
  printf "Waiting for Postgres"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' guardian-db 2>/dev/null)" = "healthy" ]; do
    printf "."
    sleep 2
  done
  echo " ready."
else
  echo "ERROR: nothing listening at $DB_HOST:$DB_PORT and Docker is not installed." >&2
  echo "Start your Postgres (or install Docker), then re-run: pnpm setup" >&2
  exit 1
fi

# 3. Dependencies
CI=true pnpm install

# 4. Schema
pnpm --filter @workspace/db run push-force

echo "Setup complete. Run: pnpm dev"
