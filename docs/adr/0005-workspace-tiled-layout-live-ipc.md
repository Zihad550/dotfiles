# A workspace's tiled layout is read via raw IPC, not watched live

The scrolling-workspace window flyout (`.scratch/workspace-window-flyout/`)
needs to know whether a workspace is running Hyprland's scrolling layout
before it shows its arrow. That field turned out to be reachable only one
way, and unwatchable at runtime for an unrelated reason surfaced along the
way.

## Why

**`tiledLayout` is read via `HyprlandWorkspace.lastIpcObject.tiledLayout`,
not a named QML property.** The installed Quickshell build (0.3.0) has no
dedicated `tiledLayout` property on `HyprlandWorkspace` — the field is only
reachable through the raw IPC passthrough. This was verified live during
design with a throwaway, panel-free `Scope`-only QML probe run as a second
`quickshell -p` instance alongside the real `dotfiles`/`launcher` instances,
checked against `hyprctl workspaces -j` on the running compositor (Hyprland
0.56.2, confirmed via `hyprctl version`) rather than assumed from
documentation. This repo's other tools have been burned by unverified IPC
assumptions before — see the "VERIFY BEFORE TRUSTING" block at the top of
`herdr/.config/herdr/config.toml`, a different tool but the same caution.

**Layout membership uses natural raw-IPC refreshes, not a dedicated layout
watcher.** `bin/df-hypr-workspace-layout-toggle` (bound to `SUPER+ALT+L`) flips
the active workspace at runtime through the Lua parser with `hyprctl -r eval`,
then reads `activeworkspace.tiledLayout` back before announcing success. The
script previously called the legacy-only `hyprctl keyword` interface and
announced success even when Hyprland rejected it. The bar still reads
`lastIpcObject` on its natural refresh path — the same trust `Workspaces.qml`
already places in it for the existing empty/opacity state — because the
installed Quickshell exposes no dedicated layout property or change signal.

## Consequences

- The scrolling-workspace flyout's visibility condition
  (`tiledLayout === "scrolling"` AND window count > 1) reads through
  `lastIpcObject`, not a named property — future edits must keep reading
  through the passthrough, not "clean up" onto a property that doesn't
  exist in Quickshell 0.3.0.
- The layout toggle reports success only after Hyprland returns the requested
  layout. The arrow picks up that layout on its next natural `lastIpcObject`
  refresh; there is no dedicated QML layout-change watcher.
