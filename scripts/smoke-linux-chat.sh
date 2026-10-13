#!/usr/bin/env bash
set -euo pipefail

# Drive a packaged Tauri window through its real WebKit UI and Rust app-server bridge.
if [[ ${1:-} == --session ]]; then
  app_bin=${2:?}
  protocol_log=${TUXCODEX_E2E_LOG:?}
  report=${TUXCODEX_E2E_REPORT:?}
  app_log=${TUXCODEX_E2E_APP_LOG:?}
  prompt='TuxCodex system smoke prompt'

  openbox >/dev/null 2>&1 &
  wm_pid=$!
  sleep 1
  GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 NO_AT_BRIDGE=1 "$app_bin" >"$app_log" 2>&1 &
  app_pid=$!
  trap 'kill "$app_pid" "$wm_pid" 2>/dev/null || true; wait "$app_pid" "$wm_pid" 2>/dev/null || true' EXIT

  window_id=''
  for attempt in {1..40}; do
    window_id=$(xdotool search --onlyvisible --name '^TuxCodex$' 2>/dev/null | head -n 1 || true)
    if [[ -n $window_id ]] && grep -Fq '"method":"model/list"' "$protocol_log"; then break; fi
    if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  if [[ -z $window_id ]] || ! grep -Fq '"method":"model/list"' "$protocol_log"; then
    cat "$app_log" "$protocol_log"
    echo 'TuxCodex did not initialize the mock app-server.' >&2
    exit 1
  fi

  xdotool windowactivate --sync "$window_id"
  sleep 1
  eval "$(xdotool getwindowgeometry --shell "$window_id")"
  xdotool mousemove --window "$window_id" "$((WIDTH * 60 / 100))" "$((HEIGHT - 115))" click 1
  xdotool type --clearmodifiers --delay 8 "$prompt"
  xdotool key Return

  for attempt in {1..30}; do
    if grep -Fq '"method":"thread/start"' "$protocol_log" && grep -Fq '"text":"TuxCodex system smoke prompt"' "$protocol_log"; then
      printf '{"windowVisible":true,"threadCreated":true,"chatSent":true}\n' >"$report"
      echo 'TuxCodex sent a chat from the packaged window through the Rust bridge.'
      exit 0
    fi
    if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
    sleep 1
  done

  cat "$app_log" "$protocol_log"
  echo 'TuxCodex did not send the typed prompt to the mock app-server.' >&2
  exit 1
fi

app_bin=$(realpath "${1:?Pass the TuxCodex executable path}")
mock_bin=$(realpath "${2:?Pass the mock Codex CLI path}")
report=${3:?Pass the report path}
mkdir -p "$(dirname "$report")"
report=$(realpath -m "$report")
protocol_log=$(mktemp)
app_log=$(mktemp)
trap 'rm -f "$protocol_log" "$app_log"' EXIT
export TUXCODEX_CODEX_BIN=$mock_bin
export TUXCODEX_E2E_LOG=$protocol_log
export TUXCODEX_E2E_REPORT=$report
export TUXCODEX_E2E_APP_LOG=$app_log
xvfb-run -a dbus-run-session -- bash "$0" --session "$app_bin"
