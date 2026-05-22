#!/usr/bin/env bash
# dev.sh — start the full web app stack in development mode
# Usage: ./dev.sh [stop]
#
# Notes:
# - This repository uses a modular Compose layout. The primary entrypoint
#   (docker-compose.yml) includes focused fragments via the Compose `include`
#   directive (Compose v2.20+): docker-compose.web.yml, docker-compose.orchestration.yml,
#   docker-compose.streaming.yml. If your environment doesn't support `include`,
#   run the fallback by specifying files explicitly, e.g.:
#     docker compose -f docker-compose.yml -f docker-compose.web.yml -f docker-compose.orchestration.yml up
#
# - The script intentionally starts Postgres first (so migrations and the DB are
#   available) and then runs the web/dev servers locally for a fast developer loop.
set -e

# Verify .env exists before starting — prevents confusing errors
if [ ! -f ".env" ]; then
  echo ""
  echo "❌ ERROR: .env file not found."
  echo "   Copy the template and try again:"
  echo ""
  echo "   cp .env.example .env"
  echo ""
  exit 1
fi

if [ "$1" = "stop" ]; then
  echo "Stopping web containers..."
  docker compose --profile web down
  exit 0
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       PoC Platform — Dev Startup        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Make sure postgres is running
echo "▶  Starting Postgres..."
# Use the primary compose entrypoint which includes any fragments via `include`.
docker compose up -d postgres

echo "   Waiting for Postgres to be healthy..."
until docker compose exec postgres pg_isready -U poc_user -d poc_db -q 2>/dev/null; do
  sleep 1
done
echo "   ✅ Postgres ready"
echo ""

# 2. Install server deps if needed
if [ ! -d "web/server/node_modules" ]; then
  echo "▶  Installing server dependencies..."
  (cd web/server && npm install)
fi

# 3. Install client deps if needed
if [ ! -d "web/client/node_modules" ]; then
  echo "▶  Installing client dependencies..."
  (cd web/client && npm install)
fi

echo ""
echo "▶  Starting API server on http://localhost:3001"
echo "   Swagger docs: http://localhost:3001/docs"
echo ""
echo "▶  Starting React dev server on http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop both servers"
echo ""

# Start both in parallel, forward Ctrl+C to both
trap 'kill 0' SIGINT SIGTERM

POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
POSTGRES_USER=poc_user \
POSTGRES_PASSWORD=poc_password \
POSTGRES_DB=poc_db \
PORT=3001 \
CORS_ORIGIN=http://localhost:3000 \
  (cd web/server && npm run dev) &

(cd web/client && npm run dev) &

wait
