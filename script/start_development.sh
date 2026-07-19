#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

component="all"
mode="foreground"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api|--admin|--storefront|--worker|--all)
      component="${1#--}"
      shift
      ;;
    --foreground|--background)
      mode="${1#--}"
      shift
      ;;
    --help|-h)
      echo "Usage: start_development.sh [--api|--admin|--storefront|--worker|--all] [--foreground|--background]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

bash "$SCRIPT_DIR/run_local.sh" "--$component" "--$mode"
