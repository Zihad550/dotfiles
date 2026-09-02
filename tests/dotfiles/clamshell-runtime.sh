#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_tmp=$(mktemp -d)
trap 'rm -rf "$test_tmp"' EXIT

fake_bin="$test_tmp/bin"
lid_dir="$test_tmp/lid/lid0"
drm_path="$test_tmp/drm"
state_home="$test_tmp/state"
monitors_file="$test_tmp/monitors.json"
call_log="$test_tmp/calls.log"
mkdir -p "$fake_bin" "$lid_dir" "$drm_path/card0-eDP-1" "$drm_path/card0-HDMI-A-1" "$state_home"

printf 'Lid Switch: closed\n' >"$lid_dir/state"
printf 'connected\n' >"$drm_path/card0-eDP-1/status"
printf 'connected\n' >"$drm_path/card0-HDMI-A-1/status"
printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true},
  {"name":"HDMI-A-1","width":1920,"height":1080,"disabled":false,"focused":false}
]' >"$monitors_file"

cat >"$fake_bin/hyprctl" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
monitors)
    [[ ${2:-} == all && ${3:-} == -j || ${2:-} == -j ]] && cat "$TEST_MONITORS"
    ;;
reload|eval)
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
if [[ ${1:-} == show && ${2:-} == --raw ]]; then
    printf '%s\n' \
        'hl.monitor({ output = "HDMI-A-1", transform = 0 })' \
        'hl.monitor({ output = "eDP-1", transform = 0 })'
    exit 0
fi
printf 'layout %s\n' "$*" >>"$TEST_CALL_LOG"
SH

chmod +x "$fake_bin"/*

run_command() {
    PATH="$fake_bin:/usr/bin:/bin" \
    HOME="$test_tmp/home" \
    XDG_STATE_HOME="$state_home" \
    DF_HYPR_LID_STATE_DIR="$test_tmp/lid" \
    DF_HYPR_DRM_PATH="$drm_path" \
    DF_HYPR_DISPLAY_LAYOUT="$fake_bin/df-hypr-display-layout" \
    TEST_MONITORS="$monitors_file" \
    TEST_CALL_LOG="$call_log" \
        "$@"
}

clamshell_flag="$state_home/hypr/internal-monitor-clamshell.lua"

# Docked close uses Omarchy's physical-connection check and disables the
# internal output through a temporary monitor rule. Workspace IPC is not part
# of this path: Hyprland evacuates those workspaces during the reload.
: >"$call_log"
run_command "$ROOT/bin/df-system-lid-close"
grep -Fx 'reload' "$call_log" >/dev/null
[[ -f "$clamshell_flag" ]]
grep -Fx 'hl.monitor({ output = "HDMI-A-1", transform = 0 })' "$clamshell_flag" >/dev/null
grep -Fx 'hl.monitor({ output = "eDP-1", disabled = true })' "$clamshell_flag" >/dev/null
if grep -q 'moveworkspace' "$call_log"; then
    exit 1
fi

# Opening removes the temporary rule and restores the repository's saved
# monitor layout.
printf 'Lid Switch: open\n' >"$lid_dir/state"
: >"$call_log"
run_command "$ROOT/bin/df-hypr-clamshell"
grep -Fx 'layout apply --quiet' "$call_log" >/dev/null
[[ ! -e "$clamshell_flag" ]]

# A physical external connector that is not an active Hyprland output must not
# enter clamshell mode yet.
printf 'Lid Switch: closed\n' >"$lid_dir/state"
printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true}
]' >"$monitors_file"
: >"$call_log"
run_command "$ROOT/bin/df-hypr-clamshell"
[[ ! -e "$clamshell_flag" ]]

# No physical external display follows the normal lock-before-suspend path.
printf 'disconnected\n' >"$drm_path/card0-HDMI-A-1/status"
: >"$call_log"
run_command "$ROOT/bin/df-system-lid-close"
grep -Fx 'qs -c lock ipc call lock lock' "$call_log" >/dev/null

echo "PASS: Omarchy-style clamshell reconciliation"

# The Hyprland-launched watcher must resolve repository helpers without relying
# on the interactive shell's PATH.
watcher_dir="$test_tmp/watcher"
watcher_log="$test_tmp/watcher-calls.log"
mkdir -p "$watcher_dir" "$test_tmp/runtime"
cp "$ROOT/bin/df-hypr-monitor-watch" "$watcher_dir/df-hypr-monitor-watch"

cat >"$watcher_dir/df-hypr-clamshell" <<'SH'
#!/usr/bin/env bash
printf 'invoked\n' >>"$TEST_WATCHER_CALL_LOG"
SH

cat >"$fake_bin/socat" <<'SH'
#!/usr/bin/env bash
printf 'configreloaded>>\n'
SH

cat >"$fake_bin/df-hw-clamshell" <<'SH'
#!/usr/bin/env bash
exit 1
SH

chmod +x "$watcher_dir/df-hypr-monitor-watch" "$watcher_dir/df-hypr-clamshell" \
    "$fake_bin/socat" "$fake_bin/df-hw-clamshell"
: >"$watcher_log"
PATH="$fake_bin:/usr/bin:/bin" \
XDG_RUNTIME_DIR="$test_tmp/runtime" \
HYPRLAND_INSTANCE_SIGNATURE=test \
TEST_WATCHER_CALL_LOG="$watcher_log" \
    timeout --foreground 3s "$watcher_dir/df-hypr-monitor-watch"

[[ $(wc -l <"$watcher_log") -ge 2 ]]
echo "PASS: monitor watcher resolves repository helpers"

layout_config_dir="$test_tmp/config/hypr"
layout_monitors="$test_tmp/layout-monitors.json"
raw_layout="$test_tmp/raw-layout"
mkdir -p "$layout_config_dir"
printf '%s\n' '[
  {"name":"eDP-1","width":1920,"height":1080,"disabled":false,"focused":true},
  {"name":"HDMI-A-1","width":1920,"height":1080,"disabled":false,"focused":false}
]' >"$layout_monitors"
cat >"$layout_config_dir/display-layouts.json" <<'JSON'
{
  "version": 1,
  "layouts": {
    "HDMI-A-1+eDP-1": {
      "default": "horizontal",
      "variants": {
        "horizontal": {
          "monitors": [
            {"output":"HDMI-A-1","transform":0},
            {"output":"eDP-1","transform":0}
          ]
        }
      }
    }
  }
}
JSON
PATH="$fake_bin:/usr/bin:/bin" \
HOME="$test_tmp/home" \
XDG_CONFIG_HOME="$test_tmp/config" \
XDG_STATE_HOME="$test_tmp/layout-state" \
TEST_MONITORS="$layout_monitors" \
    "$ROOT/bin/df-hypr-display-layout" show --raw >"$raw_layout"
! grep -q '^signature:' "$raw_layout"
grep -F "output = 'HDMI-A-1'" "$raw_layout" >/dev/null
grep -F 'transform = 0' "$raw_layout" >/dev/null
echo "PASS: display layout raw output preserves orientation rules"
