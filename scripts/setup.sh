#!/usr/bin/env bash
# Guardian local setup — one command: pnpm setup
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — paste your Gemini key into AI_INTEGRATIONS_GEMINI_API_KEY"
fi

# 2. Postgres via Docker
docker compose up -d

printf "Waiting for Postgres"
until [ "$(docker inspect -f '{{.State.Health.Status}}' guardian-db 2>/dev/null)" = "healthy" ]; do
  printf "."
  sleep 2
done
echo " ready."

# 3. Dependencies
pnpm install

# 4. Schema
pnpm --filter @workspace/db run push-force

echo "Setup complete. Run: pnpm dev"
