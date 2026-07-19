#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created local .env from .env.example"
fi

echo "Installing Siempre Barato workspace dependencies..."
npm install

echo "Preparing the local PostgreSQL database..."
bash database/scripts/create_development_database.sh

echo "Applying database migrations..."
npm run db:migrate

echo "Loading local development data..."
npm run db:seed

echo "Development installation completed."
