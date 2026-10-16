#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
script="$repo_root/setup/oneoff/input-no-suspend/setup-input-no-suspend"
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT

mkdir "$test_dir/bin"
cat >"$test_dir/bin/pactl" <<'SH'
#!/usr/bin/env bash
printf '%s\n' \
    'Source #1' $'\tName: alsa_output.pci-0000_05_00.6.analog-stereo.monitor' $'\tDescription: Monitor of Speakers' \
    'Source #2' $'\tName: alsa_input.pci-0000_05_00.6.HiFi__Mic1__source' $'\tDescription: Digital Microphone' \
    'Source #3' $'\tName: alsa_input.pci-0000_05_00.6.HiFi__Mic2__source' $'\tDescription: Ryzen HD Audio Controller, Stereo Microphone' \
    'Source #4' $'\tName: bluez_input.AA:BB:CC:DD:EE:FF' $'\tDescription: Headset'
SH
# Records the offered options and preselection, then answers with $PICK lines.
cat >"$test_dir/bin/gum" <<'SH'
#!/usr/bin/env bash
case $1 in
    choose)
        while (($#)); do [[ $1 == --selected ]] && printf '%s\n' "$2" >"$TRACE.selected"; shift; done
        cat >"$TRACE.options"
        [[ ${PICK_STATUS:-0} == 0 ]] || exit "$PICK_STATUS"
        printf '%s' "$PICK" ;;
    confirm) echo confirm >>"$TRACE"; exit "${CONFIRM_STATUS:-0}" ;;
esac
SH
cat >"$test_dir/bin/systemctl" <<'SH'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >>"$TRACE"
SH
chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH" XDG_CONFIG_HOME="$test_dir/config" TRACE="$test_dir/trace"
conf="$XDG_CONFIG_HOME/wireplumber/wireplumber.conf.d/51-dotfiles-input-no-suspend.conf"
mic2='Ryzen HD Audio Controller - Stereo Microphone [alsa_input.pci-0000_05_00.6.HiFi__Mic2__source]'
mic1='Digital Microphone [alsa_input.pci-0000_05_00.6.HiFi__Mic1__source]'

# Only ALSA inputs are offered; nothing is preselected on first run.
PICK="$mic2"$'\n' "$script" >/dev/null
[[ $(cat "$TRACE.options") == "$mic1"$'\n'"$mic2" ]]
[[ $(cat "$TRACE.selected") == "" ]]
grep -qx '      { node.name = "alsa_input.pci-0000_05_00.6.HiFi__Mic2__source" }' "$conf"
grep -q 'session.suspend-timeout-seconds = 0' "$conf"
[[ $(cat "$TRACE") == $'confirm\nsystemctl --user restart wireplumber' ]]

# Existing choices are preselected; an unchanged pick does not restart.
rm "$TRACE"
PICK="$mic2"$'\n' "$script" | grep -qx 'No change.'
[[ $(cat "$TRACE.selected") == "$mic2" ]]
[[ ! -e $TRACE ]]

# Both inputs land in one rule; declining the restart leaves WirePlumber alone.
PICK="$mic1"$'\n'"$mic2"$'\n' CONFIRM_STATUS=1 "$script" >/dev/null
[[ $(grep -c 'node.name' "$conf") == 2 ]]
[[ $(cat "$TRACE") == confirm ]]
[[ $(cat "$TRACE.selected") == "$mic2" ]]

# A rule for an unplugged input survives a rerun.
sed -i 's/HiFi__Mic1__source/usb-mic/' "$conf"
out=$(PICK="$mic2"$'\n' CONFIRM_STATUS=1 "$script")
[[ $out == *'not present now'*'.usb-mic'* ]]
grep -q 'node.name = "alsa_input.pci-0000_05_00.6.usb-mic"' "$conf"
grep -q 'HiFi__Mic2__source' "$conf"

# Cancelling the picker changes nothing.
cp "$conf" "$test_dir/before"
[[ $(PICK_STATUS=130 "$script") == *Aborted* ]]
cmp "$test_dir/before" "$conf"

# An empty pick removes the rule.
sed -i '/usb-mic/d' "$conf"
rm "$TRACE"
PICK="" "$script" >/dev/null
[[ ! -e $conf ]]
[[ $(cat "$TRACE") == $'confirm\nsystemctl --user restart wireplumber' ]]
PICK="" "$script" | grep -qx 'No change.'

echo "input-no-suspend tests passed"
