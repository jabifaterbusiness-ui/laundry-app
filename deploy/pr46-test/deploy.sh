#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 <full-40-character-commit-sha>"
  exit 1
fi
SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: sudo bash $0 <full-40-character-commit-sha>"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="/opt/laundryangel/pr46-test"
ENV_FILE="$ROOT/.env.pr46-test"
BACKUP_DIR="$ROOT/backups"
test -f "$ENV_FILE"
test -f "$SOURCE_ROOT/Dockerfile"
test -f "$SOURCE_ROOT/deploy/web.production.Dockerfile"
COMPOSE=(
  docker compose
  --env-file "$ENV_FILE"
  -f "$SCRIPT_DIR/compose.yml"
  -p laundryangel-pr46-test
)
echo "========== VALIDATE ISOLATED COMPOSE CONFIG =========="
"${COMPOSE[@]}" config --quiet
echo "========== BUILD ISOLATED API AND WEB IMAGES =========="
"${COMPOSE[@]}" build api web
echo "========== START THE DEDICATED TEST DATABASE =========="
"${COMPOSE[@]}" up -d db
DB_READY=0
for attempt in {1..30}; do
  if "${COMPOSE[@]}" exec -T db pg_isready >/dev/null 2>&1; then
    DB_READY=1
    break
  fi
  sleep 2
done
if [[ "$DB_READY" -ne 1 ]]; then
  "${COMPOSE[@]}" logs --tail=80 db
  echo "ERROR: isolated test database did not become ready."
  exit 1
fi
echo "========== BACK UP THE ISOLATED TEST DATABASE =========="
install -d -m 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BACKUP_DIR/pr46-test-pre-$SHA-$STAMP.dump"
"${COMPOSE[@]}" exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP"
test -s "$BACKUP"
cat "$BACKUP" | "${COMPOSE[@]}" exec -T db pg_restore --list >/dev/null
chmod 600 "$BACKUP"
sha256sum "$BACKUP"
ls -lh "$BACKUP"
echo "========== START API (APPLIES THIS RELEASE'S MIGRATIONS) AND WEB =========="
"${COMPOSE[@]}" up -d api web
API_READY=0
for attempt in {1..60}; do
  API_ID="$("${COMPOSE[@]}" ps -q api)"
  if [[ -n "$API_ID" ]]; then
    API_STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$API_ID" 2>/dev/null || true)"
    if [[ "$API_STATUS" == "healthy" ]]; then
      API_READY=1
      break
    fi
    if [[ "$API_STATUS" == "unhealthy" ]]; then
      "${COMPOSE[@]}" logs --tail=120 api
      echo "ERROR: isolated test API became unhealthy."
      exit 1
    fi
  fi
  sleep 3
done
if [[ "$API_READY" -ne 1 ]]; then
  "${COMPOSE[@]}" logs --tail=120 api
  echo "ERROR: isolated test API did not become healthy."
  exit 1
fi
WEB_READY=0
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:18081/health >/dev/null; then
    WEB_READY=1
    break
  fi
  sleep 3
done
if [[ "$WEB_READY" -ne 1 ]]; then
  "${COMPOSE[@]}" logs --tail=120 web api
  echo "ERROR: isolated test web/API health check failed."
  exit 1
fi
printf '%s\n' "$SHA" > "$ROOT/DEPLOYED_COMMIT"
chmod 600 "$ROOT/DEPLOYED_COMMIT"
echo "========== ISOLATED TEST STACK =========="
"${COMPOSE[@]}" ps
echo "API image: $(docker inspect -f '{{.Config.Image}}' "$("${COMPOSE[@]}" ps -q api)")"
echo "WEB image: $(docker inspect -f '{{.Config.Image}}' "$("${COMPOSE[@]}" ps -q web)")"
echo "HTTP health: $(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18081/health)"
echo "Deployed source commit: $SHA"
echo "Existing staging and production Compose projects were not targeted."
