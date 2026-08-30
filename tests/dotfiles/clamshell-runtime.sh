#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
lid_dir="$test_tmp/lid/lid0"
state_home="$test_tmp/state"
monitors_file="$test_tmp/monitors.json"
monitors_no_external_file="$test_tmp/monitors-no-external.json"
monitor_sequence_marker="$test_tmp/monitor-sequence-seen"
workspaces_file="$test_tmp/workspaces.json"
call_log="$test_tmp/calls.log"
mkdir -p "$fake_bin" "$lid_dir" "$state_home"

printf 'Lid Switch: closed\n' >"$lid_dir/state"
printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true},
  {"name":"HDMI-A-1","width":1920,"height":1080,"disabled":false,"focused":false}
]' >"$monitors_file"
printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true}
]' >"$monitors_no_external_file"
printf '%s\n' '[
  {"id":1,"name":"1","monitor":"eDP-1"},
  {"id":2,"name":"2","monitor":"eDP-1"},
  {"id":3,"name":"3","monitor":"HDMI-A-1"}
]' >"$workspaces_file"

cat >"$fake_bin/hyprctl" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
monitors)
    if [[ ${2:-} == -j ]]; then
        if [[ ${TEST_MONITOR_SEQUENCE:-} == retry && ! -e "$TEST_MONITOR_SEQUENCE_MARKER" ]]; then
            touch "$TEST_MONITOR_SEQUENCE_MARKER"
            cat "$TEST_MONITORS_NO_EXTERNAL"
        else
            cat "$TEST_MONITORS"
        fi
    fi
    ;;
workspaces)
    [[ ${2:-} == -j ]] && cat "$TEST_WORKSPACES"
    ;;
dispatch|eval|reload)
    printf '%s\n' "$*" >>"$TEST_CALL_LOG"
    ;;
esac
SH

cat >"$fake_bin/qs" <<'SH'
#!/usr/bin/env bash
printf 'qs %s\n' "$*" >>"$TEST_CALL_LOG"
SH

cat >"$fake_bin/df-hypr-display-layout" <<'SH'
#!/usr/bin/env bash
printf 'layout %s\n' "$*" >>"$TEST_CALL_LOG"
SH

chmod +x "$fake_bin"/*

run_helper() {
    PATH="$fake_bin:$PATH" \
    HOME="$test_tmp/home" \
    XDG_STATE_HOME="$state_home" \
    DF_HYPR_LID_STATE_DIR="$test_tmp/lid" \
    DF_HYPR_DISPLAY_LAYOUT="$fake_bin/df-hypr-display-layout" \
    TEST_MONITORS="$monitors_file" \
    TEST_MONITORS_NO_EXTERNAL="$monitors_no_external_file" \
    TEST_MONITOR_SEQUENCE_MARKER="$monitor_sequence_marker" \
    TEST_WORKSPACES="$workspaces_file" \
    TEST_CALL_LOG="$call_log" \
        "$ROOT/bin/df-hypr-clamshell"
}

: >"$call_log"
run_helper

grep -Fx 'dispatch moveworkspacetomonitor 1 HDMI-A-1' "$call_log" >/dev/null
grep -Fx 'dispatch moveworkspacetomonitor 2 HDMI-A-1' "$call_log" >/dev/null
grep -F 'eval hl.monitor({ output = "eDP-1", disabled = true })' "$call_log" >/dev/null
[[ -f "$state_home/hypr/clamshell-workspaces" ]]
grep -Fx '1' "$state_home/hypr/clamshell-workspaces" >/dev/null
grep -Fx '2' "$state_home/hypr/clamshell-workspaces" >/dev/null

printf 'Lid Switch: open\n' >"$lid_dir/state"
: >"$call_log"
run_helper

layout_line=$(grep -n '^layout apply --quiet$' "$call_log" | cut -d: -f1)
restore_line=$(grep -n '^dispatch moveworkspacetomonitor 1 eDP-1$' "$call_log" | cut -d: -f1)
(( layout_line < restore_line ))
[[ ! -e "$state_home/hypr/clamshell-workspaces" ]]

# The lid event can arrive before Hyprland has published the newly attached
# output. A bounded retry must still take the clamshell path once it appears.
printf 'Lid Switch: closed\n' >"$lid_dir/state"
: >"$call_log"
rm -f "$monitor_sequence_marker"
TEST_MONITOR_SEQUENCE=retry run_helper
grep -Fx 'dispatch moveworkspacetomonitor 1 HDMI-A-1' "$call_log" >/dev/null
grep -F 'eval hl.monitor({ output = "eDP-1", disabled = true })' "$call_log" >/dev/null

printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true}
]' >"$monitors_file"
printf 'Lid Switch: closed\n' >"$lid_dir/state"
: >"$call_log"
run_helper
grep -Fx 'qs -c lock ipc call lock lock' "$call_log" >/dev/null
if grep -q '^eval ' "$call_log"; then
    exit 1
fi

echo "PASS: clamshell workspace migration and restoration"
