#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
call_log="$test_tmp/calls.log"
monitor_state="$test_tmp/monitor-state"
state_home="$test_tmp/state"
mkdir -p "$fake_bin" "$state_home" "$test_tmp/runtime"

cat >"$fake_bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == monitors && ${2:-} == -j ]]; then
    if [[ $(<"$TEST_MONITOR_STATE") == enabled ]]; then
        printf '%s\n' '[{"name":"HDMI-A-1","transform":0},{"name":"eDP-1","transform":0}]'
    else
        printf '%s\n' '[{"name":"eDP-1","transform":0}]'
    fi
elif [[ ${1:-} == monitors && ${2:-} == all && ${3:-} == -j ]]; then
    if [[ $(<"$TEST_MONITOR_STATE") == enabled ]]; then
        printf '%s\n' '[{"name":"HDMI-A-1","description":"External","disabled":false,"focused":true},{"name":"eDP-1","description":"Internal","disabled":false,"focused":false}]'
    else
        printf '%s\n' '[{"name":"HDMI-A-1","description":"External","disabled":true,"focused":false},{"name":"eDP-1","description":"Internal","disabled":false,"focused":true}]'
    fi
elif [[ ${1:-} == monitors ]]; then
    if [[ $(<"$TEST_MONITOR_STATE") == enabled ]]; then
        printf '%s\n' 'Monitor HDMI-A-1' 'Monitor eDP-1'
    else
        printf '%s\n' 'Monitor eDP-1'
    fi
elif [[ ${1:-} == eval ]]; then
    printf '%s\n' "$*" >>"$TEST_CALL_LOG"
    if [[ $* == *"disabled = true"* ]]; then
        printf 'disabled\n' >"$TEST_MONITOR_STATE"
    fi
elif [[ ${1:-} == reload ]]; then
    printf 'reload\n' >>"$TEST_CALL_LOG"
    printf 'enabled\n' >"$TEST_MONITOR_STATE"
fi
SH

cat >"$fake_bin/df-hypr-display-layout" <<'SH'
#!/usr/bin/env bash
printf 'layout %s\n' "$*" >>"$TEST_CALL_LOG"
[[ ${1:-} != apply ]] || printf 'enabled\n' >"$TEST_MONITOR_STATE"
SH

cat >"$fake_bin/df-hypr-clamshell" <<'SH'
#!/usr/bin/env bash
exit 0
SH

cat >"$fake_bin/df-hw-clamshell" <<'SH'
#!/usr/bin/env bash
exit 1
SH

cat >"$fake_bin/socat" <<'SH'
#!/usr/bin/env bash
printf '%s\n' 'monitorremoved>>HDMI-A-1'
SH

chmod +x "$fake_bin"/*

run_toggle() {
    local monitor="${1:-HDMI-A-1}"
    PATH="$fake_bin:$PATH" \
    DF_HYPR_DISPLAY_LAYOUT="$fake_bin/df-hypr-display-layout" \
    XDG_STATE_HOME="$state_home" \
    TEST_CALL_LOG="$call_log" \
    TEST_MONITOR_STATE="$monitor_state" \
        "$ROOT/bin/df-hypr-close-display" toggle "$monitor"
}

run_list() {
    PATH="$fake_bin:$PATH" \
    TEST_CALL_LOG="$call_log" \
    TEST_MONITOR_STATE="$monitor_state" \
        "$ROOT/bin/df-hypr-close-display" list
}

printf 'enabled\n' >"$monitor_state"
listing=$(run_list)
jq -e 'map([.name, .enabled]) == [["HDMI-A-1", true], ["eDP-1", true]]' <<<"$listing" >/dev/null
run_toggle
grep -F "disabled = true" "$call_log" >/dev/null
[[ $(<"$monitor_state") == disabled ]]
grep -Fx 'HDMI-A-1' "$state_home/hypr/manual-disabled-monitors" >/dev/null

# Disabling a monitor emits monitorremoved. The watcher must preserve the
# manual choice instead of treating it as a physical unplug and restoring the
# saved layout that enables the output again.
PATH="$fake_bin:/usr/bin:/bin" \
XDG_RUNTIME_DIR="$test_tmp/runtime" \
XDG_STATE_HOME="$state_home" \
HYPRLAND_INSTANCE_SIGNATURE=test \
TEST_CALL_LOG="$call_log" \
TEST_MONITOR_STATE="$monitor_state" \
    timeout --foreground 1s "$ROOT/bin/df-hypr-monitor-watch" || true
if [[ $(<"$monitor_state") != disabled ]]; then
    echo "FAIL: monitor watcher re-enabled a manually disabled display" >&2
    sed 's/^/  /' "$call_log" >&2
    exit 1
fi

printf 'disabled\n' >"$monitor_state"
: >"$call_log"
if run_toggle eDP-1 2>"$test_tmp/last-display-error"; then
    echo "FAIL: the last active display was turned off" >&2
    exit 1
fi
grep -F 'cannot turn off the last active display' "$test_tmp/last-display-error" >/dev/null
run_toggle
if ! grep -Fx 'layout apply --quiet' "$call_log" >/dev/null; then
    echo "FAIL: re-enabling HDMI did not restore the remembered layout" >&2
    sed 's/^/  /' "$call_log" >&2
    exit 1
fi
[[ ! -e "$state_home/hypr/manual-disabled-monitors" ]]
if grep -F 'transform = 1' "$call_log" >/dev/null; then
    exit 1
fi

echo "PASS: display toggle restores the remembered layout"
