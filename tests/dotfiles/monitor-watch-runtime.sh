#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
call_log="$test_tmp/calls.log"
monitors_json="$test_tmp/monitors.json"
workspaces_json="$test_tmp/workspaces.json"
mkdir -p "$fake_bin" "$test_tmp/runtime/hypr/test"

cat >"$fake_bin/socat" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$TEST_MONITOR_EVENT"
SH

cat >"$fake_bin/df-hypr-clamshell" <<'SH'
#!/usr/bin/env bash
exit 0
SH

cat >"$fake_bin/df-hw-clamshell" <<'SH'
#!/usr/bin/env bash
exit 1
SH

cat >"$fake_bin/df-hypr-display-layout" <<'SH'
#!/usr/bin/env bash
printf 'layout %s\n' "$*" >>"$TEST_CALL_LOG"
SH

cat >"$fake_bin/df-hypr-monitor-laptop" <<'SH'
#!/usr/bin/env bash
printf 'eDP-1\n'
SH

cat >"$fake_bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == monitors && ${2:-} == -j ]]; then
    cat "$TEST_MONITORS_JSON"
    exit 0
fi
if [[ ${1:-} == workspaces && ${2:-} == -j ]]; then
    cat "$TEST_WORKSPACES_JSON"
    exit 0
fi
printf 'hyprctl %s\n' "$*" >>"$TEST_CALL_LOG"
SH

chmod +x "$fake_bin"/*

run_watcher() {
    : >"$call_log"
    PATH="$fake_bin:/usr/bin:/bin" \
    XDG_RUNTIME_DIR="$test_tmp/runtime" \
    HYPRLAND_INSTANCE_SIGNATURE=test \
    TEST_CALL_LOG="$call_log" \
    TEST_MONITORS_JSON="$monitors_json" \
    TEST_WORKSPACES_JSON="$workspaces_json" \
    TEST_MONITOR_EVENT="$1" \
        "$ROOT/bin/df-hypr-monitor-watch"
}

# eDP-1 and HDMI-A-1 both enabled; workspace 2 is still on eDP-1 (stale, from
# before the external existed) and HDMI-A-1 holds the empty temporary
# workspace 11 Hyprland created before any rule pointed workspaces at it.
printf '%s\n' '[
  {"name":"eDP-1","disabled":false},
  {"name":"HDMI-A-1","disabled":false}
]' >"$monitors_json"
printf '%s\n' '[
  {"id":1,"monitor":"eDP-1"},
  {"id":2,"monitor":"eDP-1"},
  {"id":11,"monitor":"HDMI-A-1"}
]' >"$workspaces_json"

run_watcher 'monitoraddedv2>>1,HDMI-A-1,Dell'

[[ $(grep -Fxc 'layout apply --quiet' "$call_log") -eq 1 ]]
if grep -F 'reload' "$call_log" >/dev/null; then
    exit 1
fi
grep -F 'hl.workspace_rule({ workspace = "1", monitor = "eDP-1", default = true })' "$call_log" >/dev/null
grep -F 'hl.workspace_rule({ workspace = "2", monitor = "HDMI-A-1", default = true })' "$call_log" >/dev/null
grep -Fx 'hyprctl dispatch hl.dsp.workspace.move({ workspace = "2", monitor = "HDMI-A-1" })' "$call_log" >/dev/null
grep -Fx 'hyprctl dispatch hl.dsp.focus({ monitor = "HDMI-A-1" })' "$call_log" >/dev/null
grep -Fx 'hyprctl dispatch hl.dsp.focus({ workspace = "2" })' "$call_log" >/dev/null
if grep -E 'dispatch (moveworkspacetomonitor|focusmonitor)( |$)' "$call_log" >/dev/null; then
    exit 1
fi

run_watcher 'monitorremovedv2>>1,HDMI-A-1,Dell'
[[ ! -s $call_log ]]

echo "PASS: monitor hotplug applies one layout and syncs workspaces to the external display"

# eDP-1 comes back (e.g. re-enabled from the Display panel) while HDMI-A-1 is
# on and currently holds workspace 1; it must move back to eDP-1.
printf '%s\n' '[
  {"name":"HDMI-A-1","disabled":false},
  {"name":"eDP-1","disabled":false}
]' >"$monitors_json"
printf '%s\n' '[
  {"id":1,"monitor":"HDMI-A-1"},
  {"id":2,"monitor":"HDMI-A-1"}
]' >"$workspaces_json"

run_watcher 'monitoraddedv2>>1,eDP-1,built-in'

grep -Fx 'hyprctl dispatch hl.dsp.workspace.move({ workspace = "1", monitor = "eDP-1" })' "$call_log" >/dev/null
if grep -F 'hl.dsp.workspace.move({ workspace = "2"' "$call_log" >/dev/null; then
    exit 1
fi

echo "PASS: re-adding the internal panel reclaims workspace 1"
