#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO_ROOT/.run"

for component in api admin storefront worker; do
  pid_file="$RUN_DIR/$component.pid"
  [[ -f "$pid_file" ]] || continue
  pid="$(cat "$pid_file")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped $component (PID $pid)"
  fi
  rm -f "$pid_file"
done
