#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
call_log="$test_tmp/calls.log"
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
    printf '%s\n' '[
      {"name":"eDP-1","activeWorkspace":{"id":1}},
      {"name":"HDMI-A-1","activeWorkspace":{"id":11}}
    ]'
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
    TEST_MONITOR_EVENT="$1" \
        "$ROOT/bin/df-hypr-monitor-watch"
}

run_watcher 'monitoraddedv2>>1,HDMI-A-1,Dell'
grep -Fx 'layout apply --quiet' "$call_log" >/dev/null
grep -Fx 'hyprctl dispatch moveworkspacetomonitor 1 HDMI-A-1' "$call_log" >/dev/null
grep -Fx 'hyprctl dispatch focusmonitor HDMI-A-1' "$call_log" >/dev/null
if grep -F 'reload' "$call_log" >/dev/null; then
    exit 1
fi

run_watcher 'monitorremovedv2>>1,HDMI-A-1,Dell'
[[ ! -s $call_log ]]

echo "PASS: monitor hotplug applies one layout and prefers the external output"
