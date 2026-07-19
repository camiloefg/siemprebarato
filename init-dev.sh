#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for command_name in node npm psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

bash "$SCRIPT_DIR/script/install_development.sh"
bash "$SCRIPT_DIR/script/start_development.sh" "$@"
