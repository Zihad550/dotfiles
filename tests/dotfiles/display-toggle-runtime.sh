#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
call_log="$test_tmp/calls.log"
monitor_state="$test_tmp/monitor-state"
mkdir -p "$fake_bin"

cat >"$fake_bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == monitors && ${2:-} == -j ]]; then
    if [[ $(<"$TEST_MONITOR_STATE") == enabled ]]; then
        printf '%s\n' '[{"name":"HDMI-A-1","transform":0},{"name":"eDP-1","transform":0}]'
    else
        printf '%s\n' '[{"name":"eDP-1","transform":0}]'
    fi
elif [[ ${1:-} == monitors ]]; then
    if [[ $(<"$TEST_MONITOR_STATE") == enabled ]]; then
        printf '%s\n' 'Monitor HDMI-A-1' 'Monitor eDP-1'
    else
        printf '%s\n' 'Monitor eDP-1'
    fi
elif [[ ${1:-} == eval ]]; then
    printf '%s\n' "$*" >>"$TEST_CALL_LOG"
fi
SH

cat >"$fake_bin/df-hypr-display-layout" <<'SH'
#!/usr/bin/env bash
printf 'layout %s\n' "$*" >>"$TEST_CALL_LOG"
SH

chmod +x "$fake_bin"/*

run_toggle() {
    PATH="$fake_bin:$PATH" \
    DF_HYPR_DISPLAY_LAYOUT="$fake_bin/df-hypr-display-layout" \
    TEST_CALL_LOG="$call_log" \
    TEST_MONITOR_STATE="$monitor_state" \
        "$ROOT/bin/df-hypr-close-display" HDMI-A-1
}

printf 'enabled\n' >"$monitor_state"
run_toggle
grep -F "disabled = true" "$call_log" >/dev/null

printf 'disabled\n' >"$monitor_state"
: >"$call_log"
run_toggle
if ! grep -Fx 'layout apply --quiet' "$call_log" >/dev/null; then
    echo "FAIL: re-enabling HDMI did not restore the remembered layout" >&2
    sed 's/^/  /' "$call_log" >&2
    exit 1
fi
if grep -F 'transform = 1' "$call_log" >/dev/null; then
    exit 1
fi

echo "PASS: display toggle restores the remembered layout"
