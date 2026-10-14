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
  if [[ ${TUXCODEX_SMOKE_APPROVAL:-} == 1 ]]; then
    for attempt in {1..40}; do
      if grep -Fq '"method":"approval/requested"' "$protocol_log"; then break; fi
      sleep .25
    done
    # The approval dialog focuses Decline by default, so Enter tests the safe
    # choice without relying on theme or distribution-specific button positions.
    sleep .5
    xdotool key --clearmodifiers Return
  fi
  if [[ ${TUXCODEX_SMOKE_FULL_ACCESS:-} == 1 ]]; then
    if [[ ${TUXCODEX_SMOKE_APPROVAL:-} != 1 ]]; then
      echo 'Full Access smoke requires the Standard approval smoke first.' >&2
      exit 1
    fi
    for attempt in {1..40}; do
      if grep -Fq '"method":"approval/response"' "$protocol_log"; then break; fi
      sleep .25
    done
    sleep .5
    xdotool mousemove --window "$window_id" "$((WIDTH * 60 / 100))" "$((HEIGHT - 115))" click 1
    # Three attachment buttons, model, effort, then the permissions control.
    # Send is disabled while the composer is empty, so it is skipped by Tab.
    xdotool key --clearmodifiers Tab Tab Tab Tab Tab Tab Return
    sleep .3
    # The confirmation dialog focuses Cancel. Move to Enable Full Access.
    xdotool key --clearmodifiers Tab Return
    sleep .3
    xdotool mousemove --window "$window_id" "$((WIDTH * 60 / 100))" "$((HEIGHT - 115))" click 1
    xdotool type --clearmodifiers --delay 8 'TuxCodex full access smoke prompt'
    xdotool key Return
  fi

  if [[ ${TUXCODEX_SMOKE_GENERATED_FILE:-} == 1 ]]; then
    screenshot="${report%.json}-generated-preview.png"
    thumbnail=''
    for attempt in {1..30}; do
      # WebKitGTK under Xvfb can defer compositing updates until the window
      # receives input. Click the empty right edge before inspecting pixels.
      xdotool mousemove --window "$window_id" "$((WIDTH - 25))" "$((HEIGHT / 2))" click 1
      sleep .2
      scrot "$screenshot"
      thumbnail=$(python3 scripts/check-generated-preview.py thumbnail "$screenshot" || true)
      if [[ -n $thumbnail ]]; then break; fi
      sleep 1
    done
    if [[ -z $thumbnail ]]; then
      cat "$app_log" "$protocol_log"
      stat "$TUXCODEX_E2E_WORKSPACE/smoke-output.svg" || true
      xdotool mousemove --window "$window_id" 120 "$((HEIGHT - 115))" click 1
      sleep 1
      scrot "${report%.json}-diagnostic.png" || true
      xdotool getwindowname "$window_id" || true
      echo 'Generated image thumbnail did not appear in the packaged app.' >&2
      exit 1
    fi
    read -r image_x image_y thumbnail_pixels <<<"$thumbnail"
    echo "Clicking generated thumbnail at screen ${image_x},${image_y}; window origin ${X},${Y}."
    xdotool mousemove --window "$window_id" "$((image_x - X))" "$((image_y - Y))" click 1
    xdotool getmouselocation --shell
    viewer_pixels=''
    for attempt in {1..15}; do
      xdotool mousemove --window "$window_id" "$((WIDTH - 25))" "$((HEIGHT / 2))" click 1
      sleep .5
      scrot "$screenshot"
      viewer_pixels=$(python3 scripts/check-generated-preview.py viewer "$screenshot" || true)
      if [[ -n $viewer_pixels ]]; then break; fi
    done
    if [[ -z $viewer_pixels ]]; then
      cat "$app_log" "$protocol_log"
      echo 'Generated image did not open in the larger built-in viewer.' >&2
      exit 1
    fi
    echo "Generated image rendered inline ($thumbnail_pixels pixels) and opened in the viewer ($viewer_pixels pixels)."
  fi

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
if (process.env.TUXCODEX_SMOKE_APPROVAL === "1") {
  const approval = requests.find((entry) => entry.method === "approval/response");
  if (approval?.params?.decision !== "decline") process.exit(1);
}
if (process.env.TUXCODEX_SMOKE_FULL_ACCESS === "1") {
  const resume = requests.find((entry) => entry.method === "thread/resume");
  const fullTurn = requests.filter((entry) => entry.method === "turn/start")[1];
  if (resume?.params?.threadId !== "smoke-thread" || resume.params.approvalPolicy !== "never" || resume.params.sandbox !== "dangerFullAccess") process.exit(1);
  if (fullTurn?.params?.approvalPolicy !== "never" || fullTurn.params.sandboxPolicy?.type !== "dangerFullAccess") process.exit(1);
  if (!fullTurn.params.input?.some((item) => item.type === "text" && item.text === "TuxCodex full access smoke prompt")) process.exit(1);
}
NODE
    then
      printf '{"windowVisible":true,"threadCreated":true,"chatSent":true,"standardPermissions":true,"modelSelected":%s,"approvalDeclined":%s,"fullAccessConfirmed":%s,"generatedFilePreviewed":%s}\n' "$( [[ ${TUXCODEX_SMOKE_SELECT_MODEL:-} == 1 ]] && echo true || echo false )" "$( [[ ${TUXCODEX_SMOKE_APPROVAL:-} == 1 ]] && echo true || echo false )" "$( [[ ${TUXCODEX_SMOKE_FULL_ACCESS:-} == 1 ]] && echo true || echo false )" "$( [[ ${TUXCODEX_SMOKE_GENERATED_FILE:-} == 1 ]] && echo true || echo false )" >"$report"
      echo 'TuxCodex sent Standard and confirmed Full Access chats through the Rust bridge.'
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
workspace=$(mktemp -d)
trap 'rm -f "$protocol_log" "$app_log" "$workspace/smoke-output.svg"; rmdir "$workspace" 2>/dev/null || true' EXIT
export TUXCODEX_CODEX_BIN=$mock_bin
export TUXCODEX_E2E_LOG=$protocol_log
export TUXCODEX_E2E_REPORT=$report
export TUXCODEX_E2E_APP_LOG=$app_log
export TUXCODEX_E2E_WORKSPACE=$workspace
xvfb-run -a dbus-run-session -- bash "$0" --session "$app_bin"
