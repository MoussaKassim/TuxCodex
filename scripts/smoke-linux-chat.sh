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
  if [[ ${TUXCODEX_SMOKE_SELECT_MODEL:-} == 1 ]]; then
    # Tab from the composer textarea through the three attachment buttons to
    # the model picker. Keyboard focus is stable across desktop font metrics.
    xdotool key --clearmodifiers Tab Tab Tab Tab
    xdotool key Return
    sleep .2
    xdotool key Down Return
    sleep .2
    xdotool key Tab
    sleep .2
    xdotool key Return
    sleep .2
    xdotool key Down Return
    sleep .2
    xdotool mousemove --window "$window_id" "$((WIDTH * 60 / 100))" "$((HEIGHT - 115))" click 1
  fi
  xdotool type --clearmodifiers --delay 8 "$prompt"
  xdotool key Return

  for attempt in {1..30}; do
    if node --input-type=commonjs - "$protocol_log" "$prompt" <<'NODE'
const fs = require("node:fs");
const [log, prompt] = process.argv.slice(2);
let requests;
try { requests = fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); }
catch { process.exit(1); }
const thread = requests.find((entry) => entry.method === "thread/start");
const turn = requests.find((entry) => entry.method === "turn/start");
if (!thread || !turn) process.exit(1);
if (thread.params.approvalPolicy !== "onRequest" || thread.params.sandbox !== "workspaceWrite") process.exit(1);
if (turn.params.approvalPolicy !== "onRequest" || turn.params.sandboxPolicy?.type !== "workspaceWrite") process.exit(1);
if (!turn.params.input?.some((item) => item.type === "text" && item.text === prompt)) process.exit(1);
if (process.env.TUXCODEX_SMOKE_SELECT_MODEL === "1") {
  if (thread.params.model !== "smoke-model" || turn.params.model !== "smoke-model" || turn.params.effort !== "low") process.exit(1);
}
NODE
    then
      printf '{"windowVisible":true,"threadCreated":true,"chatSent":true,"standardPermissions":true,"modelSelected":%s}\n' "$( [[ ${TUXCODEX_SMOKE_SELECT_MODEL:-} == 1 ]] && echo true || echo false )" >"$report"
      echo 'TuxCodex sent a Standard-permission chat from the packaged window through the Rust bridge.'
      exit 0
    fi
    if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
    sleep 1
  done

  cat "$app_log" "$protocol_log"
  echo "Window geometry: ${WIDTH}x${HEIGHT}" >&2
  if command -v scrot >/dev/null 2>&1; then
    scrot "${report%.json}-failure.png" || true
  fi
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
