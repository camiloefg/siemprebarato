#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Missing $REPO_ROOT/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$REPO_ROOT/.env"
set +a

: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=siemprebarato_dev}"
: "${DB_USER:=siemprebarato_app}"
: "${DB_PASSWORD:=siemprebarato_local_only}"

case "$DB_HOST" in
  localhost|127.0.0.1|::1) ;;
  *)
    echo "Refusing to create a development database on non-local host: $DB_HOST" >&2
    exit 1
    ;;
esac

for identifier in "$DB_NAME" "$DB_USER"; do
  if [[ ! "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Unsafe PostgreSQL identifier: $identifier" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d postgres \
  -v db_user="$DB_USER" -v db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')
\gexec
SQL

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d postgres \
  -v db_name="$DB_NAME" -v db_user="$DB_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec
SQL

echo "Local database ready: $DB_NAME"
