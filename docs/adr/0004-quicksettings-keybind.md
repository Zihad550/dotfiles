# Quick Settings gets a keybind, reached through a per-monitor registry

Quick Settings had one entry point: clicking the Gear. Windows, GNOME and
Android all ship the same panel under this name (`CONTEXT.md`), and Windows'
is the one with a documented default keybind — `SUPER+A`. This adds the
equivalent here.

## Why

**`SUPER+CTRL+A`, not `SUPER+A`.** `SUPER+A` already opens the Claude webapp
(`bindings/apps.lua`) — reassigning it would be a second, unrelated change
riding on this one. `SUPER+COMMA` was also free but was rejected: it,
`SUPER+SHIFT+COMMA` and `SUPER+CTRL+COMMA` are a self-contained
notification-dismiss family (`bindings/utilities.lua`), and Quick Settings
doesn't belong in it. `SUPER+CTRL+A` was unclaimed and keeps the `A` mnemonic.

**A per-monitor registry, not a single floating panel.** `QuickSettings` is
instantiated once per screen inside `Bar.qml`, anchored under that screen's
own Gear (`anchor.item: target`). The alternative was collapsing it to one
shared instance with `screen` left unset — the pattern `Osd.qml` uses to
"float on the active monitor" — which is less code, but a floating panel has
no gear to anchor under, so a click-open and a keybind-open would land in
different places. `QuickSettingsRegistry.qml` keeps one `QuickSettings` per
monitor and lets `shell.qml`'s `GlobalShortcut` reach the focused one by
name, so both entry points open in the exact same spot.

**Registered by monitor name, not by object.** `Bar.qml` captures
`modelData.name` into a `monitorName` property at construction rather than
reading `screen.name` later. On monitor unplug, `Variants` destroys the `Bar`
and its `ShellScreen` can already be invalid by the time
`Component.onDestruction` runs to unregister it.

**`GlobalShortcut`, not `qs ipc call`.** The bar shell's existing binds
(notifications, OSD) fork `qs ipc call` per press — fine for one-shot
commands, but Quick Settings toggles a panel a user may press repeatedly, the
same shape as the Launcher's `launcher:toggle`. `GlobalShortcut` registers
directly with the compositor: no fork, no exec, on every press.

## Consequences

- `QuickSettingsRegistry.qml` (dotfiles config root, `pragma Singleton`) maps
  monitor name → that monitor's `QuickSettings` instance.
- `Bar.qml` registers on `Component.onCompleted`, unregisters on
  `Component.onDestruction`.
- `shell.qml` gains one `GlobalShortcut` (`appid: "quicksettings"`,
  `name: "toggle"`) that reads `Hyprland.focusedMonitor`, looks up that
  monitor in the registry, and calls `.toggle()` — silently warning to the
  log (not the user) if either is unavailable, since this is a keybind with
  no confirmation UI to fail loudly into.
- `bindings/utilities.lua` gains `SUPER+CTRL+A`, next to the other binds that
  dispatch into the `dotfiles` bar process rather than the Launcher.
- The Gear's `CONTEXT.md` entry now notes it isn't the only opener.
