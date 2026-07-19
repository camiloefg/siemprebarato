#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO_ROOT/.run"
LOG_DIR="$RUN_DIR/logs"
API_PORT="${API_PORT:-3020}"
ADMIN_PORT="${ADMIN_PORT:-5178}"
STOREFRONT_PORT="${STOREFRONT_PORT:-5179}"
MAX_LOG_LINES="${MAX_LOG_LINES:-2500}"

component="all"
mode="foreground"
declare -a child_pids=()

usage() {
  cat <<'EOF'
Usage: run_local.sh [--api|--admin|--storefront|--worker|--all] [--foreground|--background]

Starts Siempre Barato components with isolated local ports.
Foreground mode stops every selected child on Ctrl+C.
Background mode stores PID and bounded logs under .run/.
EOF
}

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
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$LOG_DIR"

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "Dependencies are missing. Run: bash script/install_development.sh" >&2
  exit 1
fi

port_listeners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' || true
  fi
}

check_port() {
  local port="$1"
  local label="$2"
  if [[ -n "$(port_listeners "$port")" ]]; then
    echo "$label port $port is already in use." >&2
    if command -v lsof >/dev/null 2>&1; then
      lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
    fi
    exit 1
  fi
}

component_command() {
  case "$1" in
    api) echo "npm run dev:api" ;;
    admin) echo "ADMIN_PORT=$ADMIN_PORT npm run dev:admin" ;;
    storefront) echo "STOREFRONT_PORT=$STOREFRONT_PORT npm run dev:storefront" ;;
    worker) echo "npm run dev:worker" ;;
    *) return 1 ;;
  esac
}

selected_components() {
  if [[ "$component" == "all" ]]; then
    echo "api admin storefront worker"
  else
    echo "$component"
  fi
}

check_selected_ports() {
  local selected
  for selected in $(selected_components); do
    case "$selected" in
      api) check_port "$API_PORT" "API" ;;
      admin) check_port "$ADMIN_PORT" "Admin" ;;
      storefront) check_port "$STOREFRONT_PORT" "Storefront" ;;
    esac
  done
}

stop_children() {
  local pid
  trap - INT TERM EXIT
  for pid in "${child_pids[@]:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${child_pids[@]:-}"; do
    wait "$pid" 2>/dev/null || true
  done
}

start_foreground_component() {
  local selected="$1"
  local command_value
  command_value="$(component_command "$selected")"
  echo "Starting $selected..."
  (
    cd "$REPO_ROOT"
    exec bash -lc "$command_value"
  ) &
  child_pids+=("$!")
}

start_background_component() {
  local selected="$1"
  local command_value
  local log_file="$LOG_DIR/$selected.log"
  local pid_file="$RUN_DIR/$selected.pid"
  command_value="$(component_command "$selected")"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$selected is already running with PID $(cat "$pid_file")"
    return
  fi

  if [[ -f "$log_file" ]]; then
    tail -n "$MAX_LOG_LINES" "$log_file" >"$log_file.tmp" 2>/dev/null || true
    mv "$log_file.tmp" "$log_file" 2>/dev/null || true
  fi
  (
    cd "$REPO_ROOT"
    exec bash -lc "$command_value"
  ) >>"$log_file" 2>&1 &
  echo "$!" >"$pid_file"
  echo "Started $selected with PID $! (log: $log_file)"
}

check_selected_ports

if [[ "$mode" == "background" ]]; then
  for selected in $(selected_components); do
    start_background_component "$selected"
  done
  exit 0
fi

trap stop_children INT TERM EXIT
for selected in $(selected_components); do
  start_foreground_component "$selected"
done

echo ""
echo "Siempre Barato local stack"
echo "  API:        http://127.0.0.1:$API_PORT"
echo "  Admin:      http://127.0.0.1:$ADMIN_PORT"
echo "  Storefront: http://127.0.0.1:$STOREFRONT_PORT"
echo "Press Ctrl+C to stop the selected components."

while true; do
  for pid in "${child_pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      exit $?
    fi
  done
  sleep 1
done
