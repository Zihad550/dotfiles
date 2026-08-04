# 02 — Second Quickshell config with shared theme

**What to build:** A second always-running Quickshell instance that will host the Launcher, themed identically to the bar and restartable without disturbing it.

**Blocked by:** 01 — Verify foundation APIs.

**Status:** done — verified on the host.

- [x] A second instance runs alongside the bar and starts with the session
- [x] It follows the active theme and restyles live when the theme changes, exactly as the bar does
- [x] Restart tooling can target either instance independently
- [x] Restarting or crashing the second instance leaves the bar, notifications and OSD running
- [x] Theme definitions are not duplicated in a way that lets the two instances drift apart

## Comments

Written from the devcontainer, which has no `quickshell` binary and no Wayland
session, so the four checkboxes that describe a running instance are left open
rather than claimed on inspection. What was built:

- `quickshell/.config/quickshell/launcher/shell.qml` — a `ShellRoot` holding
  only the theme `IpcHandler` so far. The window itself is ticket 03.
- `quickshell/.config/quickshell/launcher/Theme.qml` — its own singleton, since
  each config root is its own import namespace. Not duplicated definitions:
  both configs are `FileView` readers of `~/.config/theme/quickshell.json`, so
  color cannot drift. The metrics below the color block differ on purpose — the
  bar is compact because it is read from the corner, the Launcher is not.
- `hypr/.config/hypr/lua/autostart.lua` — starts `quickshell -c launcher`
  alongside the bar.
- `bin/df-qs-restart` — now takes a config name, defaulting to `dotfiles`. One
  at a time on purpose: restarting both together would give up the isolation
  that is the whole point of the split.
- `bin/df-theme-set` — pokes `ipc call theme reload` for **both** configs. It
  poked only `dotfiles` before, and the `FileView` watch alone does not cover a
  theme *switch*, which retargets the `~/.config/theme` symlink rather than
  editing the file. Without this the Launcher would keep the old palette.
- `bin/df-qs-test` — now refuses `launcher` as well as `dotfiles`, since both
  are long-running instances that `autostart.lua` owns and a foreground scratch
  copy would replace the live one.

`stow quickshell` in `scripts/stow/stow-hyprland` already covers the new
directories; no change needed there.

## Host result

All four ticked, run on the Arch host alongside ticket 03's block and reported
working — a blanket pass rather than pasted output.

The **known limit** below is now closed rather than carried forward: it said
the reload could only be proven to *reach* the Launcher, not that the colours
were applied, because there was no window until ticket 03. There is a window
now, `df-theme-set` was run against another theme, and the Launcher restyled
live. That is the visual confirmation the limit asked for.

## Manual verification

Closes: all four open checkboxes above. Runs on the Arch host, in a Hyprland
session. Stow first if ticket 01's block has not already been run:

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
```

**1. A second instance runs alongside the bar.**

```bash
df-qs-restart launcher
qs -c launcher log
qs -c launcher ipc show
```

**Expected:** the log is clean — no QML errors. `ipc show` lists a `theme`
target. A QML error keeps the *previous* config alive rather than crashing, so
an instance that seems fine but shows errors here has not actually reloaded.

**2. It starts with the session.** `autostart.lua` now launches
`quickshell -c launcher` alongside the bar. Worth confirming before relying on
it — after the next login, or without logging out:

```bash
uwsm-app -- quickshell -c launcher -d
qs -c launcher log
```

**3. Restarting the Launcher leaves the bar, notifications and OSD running.**

```bash
df-qs-restart launcher
notify-send "isolation check" "bar and notifications should be unaffected"
```

Then press a volume key. **Expected:** the bar never blinks, the notification
appears, the OSD pill appears. Then the reverse — restarting the bar must not
disturb the Launcher:

```bash
df-qs-restart
qs -c launcher log        # expect still running, still clean
```

**4. It follows the active theme.**

```bash
df-theme-set <some-other-theme>
```

**Expected:** *two* `ipc call theme reload` invocations with no stderr. Output
is deliberately not silenced here, because `qs ipc call` exits 0 even for a
target that does not exist — its stderr is the only signal that a config was
missed. An error naming `launcher` means it is not running or the handler did
not register.

**Known limit:** this proves the reload *reaches* the Launcher, not that the
new colors were applied, because the Launcher has no window until ticket 03.
Tick the checkbox on this evidence and confirm visually at 03, or ask for a
temporary line logging the resolved colors on reload if you want it closed
outright now.

Paste the output of steps 1 and 4 back.
