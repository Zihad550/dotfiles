# 03 — Scrolling-workspace window flyout

**What to build:** the feature itself. A numbered workspace's bar entry
gains a small arrow, visible only when that workspace's `tiledLayout` (read
live off Hyprland IPC) is `"scrolling"` and it holds more than one window.
Clicking the arrow opens a `Flyout` (ticket 01) listing that workspace's
windows in Hyprland's own order — the order they actually sit in the scroll,
not reordered — each row named via the module from ticket 02 (title as
label, app id as detail), with a bullet on whichever window is Hyprland's
current active toplevel. Clicking a row activates that window and closes the
flyout. The workspace name's own click-to-switch behavior is untouched,
unconditionally, on every numbered workspace. The arrow and any open flyout
disappear the instant the workspace drops to one window or off scrolling
layout.

**Blocked by:** 01 (Extract shared Flyout component from SpecialWorkspaces),
02 (Window-naming fallback module + test)

**Status:** ready-for-agent

- [ ] A new per-workspace entry (or equivalent) computes visibility as
      `tiledLayout === "scrolling"` AND window count > 1, wired into the
      numbered-workspaces `Repeater`
- [ ] The arrow appears only when that condition holds, and does nothing but
      toggle a `Flyout` instance built from ticket 01
- [ ] Flyout rows follow `workspace.toplevels.values`'s own order with no
      reordering, labeled/detailed via the ticket 02 naming module, with a
      bullet on the toplevel matching `Hyprland.activeToplevel`
- [ ] Clicking a row calls that toplevel's `.activate()` and closes the
      flyout
- [ ] Clicking the workspace's own name still always switches to that
      workspace, unconditionally — no change from current behavior
- [ ] (Host-only — no compositor in the devcontainer, hand off as
      `needs-info` per `docs/agents/issue-tracker.md`) On a live
      scrolling-layout workspace with 2+ windows: the arrow appears; the
      flyout lists windows in scroll order with correct titles or fallback
      names and the right one bulleted; clicking a row switches focus
      (cross-checked against `hyprctl activewindow -j`); closing windows
      down to one makes the arrow disappear; a workspace with the same
      window count on dwindle layout never shows the arrow
