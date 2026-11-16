#!/usr/bin/env bash
set -euo pipefail
ROOT="/opt/laundryangel/pr46-test"
ENV_FILE="$ROOT/.env.pr46-test"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0"
  exit 1
fi
install -d -m 700 "$ROOT"
if [[ -e "$ENV_FILE" ]]; then
  echo "Refusing to overwrite existing environment file: $ENV_FILE"
  exit 1
fi
umask 077
DB_PASSWORD="$(openssl rand -hex 32)"
JWT_ACCESS="$(openssl rand -hex 32)"
JWT_REFRESH="$(openssl rand -hex 32)"
MIGRATION_KEY="$(openssl rand -hex 32)"
BACKUP_KEY="$(openssl rand -hex 32)"
cat > "$ENV_FILE" <<EOF
PR46_TEST_ENV_FILE=$ENV_FILE
PR46_TEST_DB_USER=laundryangel_pr46_test
PR46_TEST_DB_PASSWORD=$DB_PASSWORD
PR46_TEST_DB_NAME=laundryangel_pr46_test
NODE_ENV=production
ENABLE_BACKGROUND_SCHEDULERS=false
PORT=4000
APP_URL=http://localhost:18081
WEB_APP_URL=http://localhost:18081
CORS_ORIGIN=http://localhost:18081
JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH
LOG_LEVEL=info
MIGRATION_STORAGE_KEY=$MIGRATION_KEY
BACKUP_ENCRYPTION_KEY=$BACKUP_KEY
MIGRATION_MAX_UPLOAD_BYTES=104857600
MIGRATION_MAX_UNCOMPRESSED_BYTES=209715200
MIGRATION_MAX_ROWS_PER_TABLE=200000
EOF
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
echo "Created protected PR #46 test environment: $ENV_FILE"
echo "Permissions: $(stat -c '%a %U:%G' "$ENV_FILE")"
echo "Secret values were generated locally and were not printed."
