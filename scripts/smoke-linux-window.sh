#!/usr/bin/env bash
set -euo pipefail

app_bin=${1:?Pass the TuxCodex executable path}
smoke_log=$(mktemp)
trap 'rm -f "$smoke_log"' EXIT

xvfb-run -a bash -c '
  set -euo pipefail
  app_bin=$1
  smoke_log=$2
  GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 "$app_bin" >"$smoke_log" 2>&1 &
  app_pid=$!
  trap '\''kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true'\'' EXIT

  for attempt in {1..20}; do
    if xdotool search --onlyvisible --name TuxCodex >/dev/null 2>&1; then
      echo "TuxCodex opened a visible window."
      exit 0
    fi
    if ! kill -0 "$app_pid" 2>/dev/null; then
      cat "$smoke_log"
      echo "TuxCodex exited before opening a window." >&2
      exit 1
    fi
    sleep 1
  done

  cat "$smoke_log"
  echo "TuxCodex did not open a window within 20 seconds." >&2
  exit 1
' _ "$app_bin" "$smoke_log"
