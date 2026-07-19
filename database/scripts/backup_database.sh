#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${SB_ENV_FILE:-$REPO_ROOT/.env}"
BACKUP_DIR="${SB_BACKUP_DIR:-$REPO_ROOT/database/backups/files}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date +%Y-%m-%d_%H%M%S)"
backup_file="$BACKUP_DIR/${DB_NAME}_${timestamp}.dump"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --file="$backup_file" \
  "$DB_NAME"

shasum -a 256 "$backup_file" >"$backup_file.sha256"
chmod 600 "$backup_file" "$backup_file.sha256"
echo "Backup created: $backup_file"
