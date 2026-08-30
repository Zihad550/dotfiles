# Lid and clamshell verification

This checklist verifies the existing lock-before-suspend path and records the
lid behavior needed to define issue #114. It does not itself close #114:
that issue still needs acceptance criteria based on an observed lid or
clamshell failure.

Run the host checks on a physical laptop running Arch Linux and Hyprland. Do
not use the Arch devbox target for this test: its no-sleep policy masks sleep
targets and ignores lid actions by design.

## New machine setup

The complete Arch Hyprland setup installs the runtime pieces needed by the
Session Lock. You do not need a separate lock package installation when using
the repository installer.

On a new Arch machine, run:

```bash
sudo pacman -S --needed git
git clone https://github.com/Zihad550/dotfiles.git "$HOME/dotfiles"
cd "$HOME/dotfiles"
./setup/boot.sh arch-hyprland
sudo reboot
```

Choose the reboot when the installer offers it, or run the final command
yourself. The reboot is required because `setup-sleep-inhibit` writes
`/etc/systemd/logind.conf.d/20-inhibit-delay.conf`, and logind must load that
drop-in before the lid test.

For an existing installation that already has this repository:

```bash
cd "$HOME/dotfiles"
git pull --ff-only
./setup/arch-hyprland/setup-packages/setup-lock-pam
./setup/arch-hyprland/setup-packages/setup-sleep-inhibit
./scripts/stow/stow-hyprland
df-qs-restart lock
sudo reboot
```

The desktop runtime needs `quickshell`, `systemd-inhibit`, `gdbus`, `busctl`,
and `notify-send`. The normal setup supplies them through Quickshell and the
system packages. `nodejs` is only needed for the repository's JavaScript test
suite; it is not needed for the lock to run.

## 1. Confirm the test host

Run this inside the Hyprland session:

```bash
set -eu
test -n "${WAYLAND_DISPLAY:-}"
test -n "${XDG_SESSION_ID:-}"
test "$(loginctl show-session "$XDG_SESSION_ID" -p Type --value)" = wayland
command -v quickshell gdbus busctl systemd-inhibit notify-send
test -f /etc/pam.d/df-lock
test -f /etc/systemd/logind.conf.d/20-inhibit-delay.conf
grep -Fx 'InhibitDelayMaxSec=15' /etc/systemd/logind.conf.d/20-inhibit-delay.conf
echo "PASS: Hyprland session and lock dependencies are installed"
```

Pass: the command prints the five executable paths and the final PASS line.

## 2. Run the automated lock checks

These tests do not suspend the machine or take a real Session Lock. If `node`
is missing, install the test-only dependency first:

```bash
set -eu
cd "$HOME/dotfiles"
if ! command -v node >/dev/null 2>&1; then
    sudo pacman -S --needed nodejs
fi
node --test "tests/lock/*.test.js"
```

Pass: every test passes and the process exits with status 0.

## 3. Restart the Session Lock and inspect its inhibitor

```bash
set -eu
df-qs-restart lock --log
systemd-inhibit --list | grep -F 'df lock'
```

Pass: the restart succeeds, the log contains no fatal Quickshell error, and
`systemd-inhibit --list` shows a `df lock` row for `sleep` with `delay` mode.

## 4. Confirm logind loaded the longer delay window

```bash
set -eu
busctl get-property \
    org.freedesktop.login1 /org/freedesktop/login1 \
    org.freedesktop.login1.Manager InhibitDelayMaxUSec
```

Pass: the output is `t 15000000`. If it is `t 5000000`, the drop-in has not
been loaded; reboot and repeat this step before testing the lid.

## 5. Test suspend from the keybind

Save your work first. Run this command, then press `SUPER + CTRL + S` when the
terminal tells you to:

```bash
set -eu
echo "Press SUPER + CTRL + S now, then wake the machine and press Enter."
read -r
echo "PASS checkpoint reached"
```

Pass: after waking, the Session Lock password field is visible instead of the
desktop, and no `Screen did not lock before suspend` notification appears.

## 6. Test the lid on the laptop itself

Save your work and disconnect an external dock or monitor for this first run.
Run the command, close the lid, wait for the laptop to suspend, open it, and
unlock:

```bash
set -eu
echo "Close the laptop lid, wait for suspend, open it, and unlock."
read -r
echo "PASS checkpoint reached"
```

Pass for the existing lock path: opening the lid shows the Session Lock
password field, not the desktop, and unlocking succeeds normally.

Record these observations even when the test passes:

- Did closing the lid suspend the laptop?
- Did it suspend immediately or only after a noticeable delay?
- Was the password field already present on wake?
- Did the lock log report `df lock: suspending without a Secure session`?
- Did any monitor disappear or reappear during the transition?

## 7. Repeat with an external display or dock

If the laptop normally uses a dock or external monitor, connect it and repeat
the previous lid test. Record whether closing the lid changes the result,
including whether the external display remains active and whether the Session
Lock covers every display after wake.

This comparison is the evidence needed for #114. A difference between the
laptop-only and docked cases is a concrete clamshell-handling bug to turn into
acceptance criteria. Do not infer a failure merely because the behavior differs
from another desktop environment.

## 8. Capture the lock log

After the tests, run:

```bash
qs -c lock log | tail -30
```

Pass for the normal path: there is no `df lock: suspending without a Secure
session` line. If that line appears, save the complete output and note which
test preceded it.

## Report results

Paste the following with the actual outputs and observations into the #122
issue, then use the result to triage #114:

```text
Machine:
Arch/Hyprland versions:
Laptop-only result:
Docked/external-display result:
InhibitDelayMaxUSec output:
df lock inhibitor present: yes/no
Lock log warning present: yes/no
Monitor transition notes:
```
