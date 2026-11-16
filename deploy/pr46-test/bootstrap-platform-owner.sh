#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="/opt/laundryangel/pr46-test"
ENV_FILE="$ROOT/.env.pr46-test"
test -f "$ENV_FILE"
COMPOSE=(
  docker compose
  --env-file "$ENV_FILE"
  -f "$SCRIPT_DIR/compose.yml"
  -p laundryangel-pr46-test
)
API_ID="$("${COMPOSE[@]}" ps -q api)"
if [[ -z "$API_ID" ]] || [[ "$(docker inspect -f '{{.State.Health.Status}}' "$API_ID")" != "healthy" ]]; then
  echo "The isolated PR #46 API must be healthy before bootstrapping the Platform Owner."
  exit 1
fi
read -r -p "Test Platform Owner email: " PLATFORM_OWNER_EMAIL
read -r -p "Test Platform Owner full name: " PLATFORM_OWNER_NAME
read -r -s -p "Choose a unique test password (minimum 12 characters): " PLATFORM_OWNER_PASSWORD
echo
read -r -s -p "Confirm test password: " PASSWORD_CONFIRM
echo
if [[ "$PLATFORM_OWNER_PASSWORD" != "$PASSWORD_CONFIRM" ]]; then
  echo "Passwords did not match."
  exit 1
fi
if [[ "${#PLATFORM_OWNER_PASSWORD}" -lt 12 ]]; then
  echo "Password must be at least 12 characters."
  exit 1
fi
export PLATFORM_OWNER_EMAIL PLATFORM_OWNER_NAME PLATFORM_OWNER_PASSWORD
"${COMPOSE[@]}" run --rm --no-deps \
  -e PLATFORM_OWNER_EMAIL \
  -e PLATFORM_OWNER_NAME \
  -e PLATFORM_OWNER_PASSWORD \
  api node dist/platform-owner-bootstrap.js
unset PLATFORM_OWNER_PASSWORD PASSWORD_CONFIRM
echo "Isolated test Platform Owner bootstrap completed."
