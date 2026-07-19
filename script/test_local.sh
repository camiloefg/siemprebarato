#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Running workspace tests and type checks..."
npm test

echo "Building API and frontends..."
npm run build

if [[ -f .env ]] && command -v psql >/dev/null 2>&1; then
  echo "Verifying the local database schema..."
  npm run db:verify
else
  echo "Skipping database verification because local database configuration is unavailable."
fi

echo "Local validation completed."
