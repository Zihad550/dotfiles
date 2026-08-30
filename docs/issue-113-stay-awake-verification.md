# Stay Awake Verification — GitHub Issue #113

Run everything from a terminal inside the active Hyprland desktop.

## 1. Confirm the host session

```bash
test -n "$WAYLAND_DISPLAY"
test -n "$HYPRLAND_INSTANCE_SIGNATURE"
echo "Hyprland session detected"
```

Expected:

```text
Hyprland session detected
```

## 2. Back up the idle configuration

```bash
IDLE_CONFIG="$HOME/.config/df/idle.json"
BACKUP_DIR="$(mktemp -d)"

test -e "$IDLE_CONFIG" || test -L "$IDLE_CONFIG"
mv "$IDLE_CONFIG" "$BACKUP_DIR/idle.json.original"

echo "Backup: $BACKUP_DIR/idle.json.original"
```

Keep the printed backup path until the test is complete.

## 3. Install short temporary timeouts

```bash
printf '%s\n' '{"dim":10,"lock":20,"blank":30,"suspend":40}' > "$IDLE_CONFIG"
df-qs-restart dotfiles
df-qs-restart lock
```

The temporary timings are:

- Dim: 10 seconds
- Lock: 20 seconds
- Blank: 30 seconds
- Suspend: 40 seconds

## 4. Enable Stay Awake

Open Quick Settings with `SUPER+CTRL+A`, then click **Stay Awake**.

Check the persisted state:

```bash
test -f "$HOME/.local/state/dotfiles/toggles/stay-awake" \
  && echo "Stay Awake state: on" \
  || echo "Stay Awake state: off"
```

Expected:

```text
Stay Awake state: on
```

The tile should also be visibly active.

## 5. Verify idle suppression

Leave the machine untouched for at least 45 seconds.

Expected:

- No dimming after 10 seconds.
- No locking after 20 seconds.
- No blanking after 30 seconds.
- No automatic suspend after 40 seconds.

Move the mouse afterward.

## 6. Verify manual lock

While Stay Awake is still enabled:

1. Press `SUPER+CTRL+SHIFT+L`.
2. Unlock with your password.

Expected: manual locking works normally.

## 7. Verify manual suspend

While Stay Awake is still enabled:

1. Press `SUPER+CTRL+S`.
2. Resume the machine.
3. Unlock if necessary.

Expected: manual suspend still works.

## 8. Verify persistence across shell restart

```bash
df-qs-restart dotfiles
df-qs-restart lock
```

Open Quick Settings again.

Expected:

- Stay Awake is still visibly active.
- The state file still exists:

```bash
test -f "$HOME/.local/state/dotfiles/toggles/stay-awake" \
  && echo "Persistence: passed"
```

## 9. Verify disabling starts a fresh timer

Click **Stay Awake** to disable it, then move the mouse once.

```bash
test ! -f "$HOME/.local/state/dotfiles/toggles/stay-awake" \
  && echo "Stay Awake state: off"
```

Expected:

```text
Stay Awake state: off
```

Then:

1. Wait 5 seconds — the screen should not dim.
2. Wait another 10 seconds — the screen should dim.
3. Move the mouse to restore it.

This confirms the timer restarted from zero after disabling the toggle.

## 10. Restore the original configuration

Replace `$BACKUP_DIR` with the path printed in step 2:

```bash
mv "$IDLE_CONFIG" "$BACKUP_DIR/idle.json.test"
mv "$BACKUP_DIR/idle.json.original" "$IDLE_CONFIG"

df-qs-restart lock
rm -rf "$BACKUP_DIR"
```

Expected: the original `idle.json` symlink or file is restored exactly.

After completing the plan, paste the command output and pass/fail observations on [GitHub issue #113](https://github.com/Zihad550/dotfiles/issues/113).
