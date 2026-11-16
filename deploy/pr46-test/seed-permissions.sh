#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="/opt/laundryangel/pr46-test/.env.pr46-test"
test -f "$ENV_FILE"
COMPOSE=(
  docker compose
  --env-file "$ENV_FILE"
  -f "$SCRIPT_DIR/compose.yml"
  -p laundryangel-pr46-test
)
API_ID="$("${COMPOSE[@]}" ps -q api)"
if [[ -z "$API_ID" ]] || [[ "$(docker inspect -f '{{.State.Health.Status}}' "$API_ID")" != "healthy" ]]; then
  echo "The isolated PR #46 API must be healthy before seeding permissions."
  exit 1
fi
"${COMPOSE[@]}" run --rm --no-deps api node --input-type=module -e '
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "./dist/modules/permissions/permissions.catalog.js";
const prisma = new PrismaClient();
try {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }
  console.log("Seeded or verified " + PERMISSIONS.length + " permission definitions.");
} finally {
  await prisma.$disconnect();
}
'
