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

**Layout membership is treated as fixed for the life of the bar's running
session, not watched for live changes.** `bin/df-hypr-workspace-layout-toggle`
(bound to `SUPER+ALT+L`) is the only thing that flips a workspace's layout at
runtime. It calls `hyprctl keyword workspace $ID, layout:$LAYOUT`, and that
rejects on this Hyprland build ("can't work with non-legacy parsers, use
eval") — confirmed by reading the script, not by running it live against the
user's session. Nothing on this machine can actually change a workspace's
layout while it's running, so there is nothing today for a live-updating
binding to be exercised against. Reading `lastIpcObject` once per natural
refresh — the same trust `Workspaces.qml` already places in it for the
existing empty/opacity state — was judged sufficient. This was a
side-effect finding from the same probe, not the goal of running it.

## Consequences

- The scrolling-workspace flyout's visibility condition
  (`tiledLayout === "scrolling"` AND window count > 1) reads through
  `lastIpcObject`, not a named property — future edits must keep reading
  through the passthrough, not "clean up" onto a property that doesn't
  exist in Quickshell 0.3.0.
- If `bin/df-hypr-workspace-layout-toggle` is fixed later, the arrow picks
  up the new layout on its next natural `lastIpcObject` refresh, with no
  dedicated live-update path needed — worth re-checking then, not before.
- Fixing `bin/df-hypr-workspace-layout-toggle` itself is out of scope here;
  it's a `hyprctl keyword` legacy-parser problem unrelated to the bar.
