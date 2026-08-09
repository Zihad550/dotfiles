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

**Status:** done

- [x] A new per-workspace entry (or equivalent) computes visibility as
      `tiledLayout === "scrolling"` AND window count > 1, wired into the
      numbered-workspaces `Repeater` — live-verified, see Manual verification
- [x] The arrow appears only when that condition holds, and does nothing but
      toggle a `Flyout` instance built from ticket 01 — host-verified, see
      Comments
- [x] Flyout rows follow `workspace.toplevels.values`'s own order with no
      reordering, labeled/detailed via the ticket 02 naming module, with a
      bullet on the toplevel matching `Hyprland.activeToplevel` — host-verified,
      see Comments
- [x] Clicking a row calls that toplevel's `.wayland.activate()` (corrected
      from the ticket's original `.activate()` — see Comments:
      `HyprlandToplevel` itself has no `activate()` on the installed
      Quickshell build) and closes the flyout — host-verified, see Comments
- [x] Clicking the workspace's own name still always switches to that
      workspace, unconditionally — this line (`onClicked: root.modelData.activate()`,
      unconditional, no gating) is byte-for-byte the pre-existing code moved
      into the new file, not new behavior, so there is nothing new here to
      click-verify
- [x] (Host-only) On a live scrolling-layout workspace with 2+ windows: the
      arrow toggles the flyout open and shut; the flyout lists windows in
      scroll order with correct titles or fallback names and the right one
      bulleted; clicking a row switches focus (cross-checked against
      `hyprctl activewindow -j`) and closes the flyout; closing windows down
      to one makes the arrow disappear (and closes the flyout first, if it
      was left open) — host-verified, see Comments

## Manual verification

This session had a live compositor (Hyprland 0.56.2), unlike the
devcontainer `docs/agents/issue-tracker.md` describes, so the checks below
are already done, not just inspected. What's left needs an actual mouse
click, which nothing in this session could simulate.

- `quickshell -c dotfiles log` (after starting `quickshell -c dotfiles`,
  since no instance was running) showed a clean `Configuration Loaded` with
  no warnings or errors after `Workspace.qml`/`Workspaces.qml`'s edits
  landed — confirms both files parse and the new `Workspace` type resolves
  with no `model`/`delegate` collision.
- A `grim` screenshot of the bar, taken with workspace 1 (scrolling, 2
  windows), workspace 2 (dwindle, 1 window), and workspace 3 (scrolling, 3
  windows) all live at once (`hyprctl workspaces -j`), showed the `▾` arrow
  on workspaces 1 and 3 and *not* on workspace 2 — the visibility condition
  gating correctly in the real bar, not just in code.

What's left needs an actual click, which this session had no `ydotool` /
`wlrctl` / `wtype` to simulate (checked: none installed):

```
# With a scrolling-layout workspace holding 2+ windows (workspace 1 or 3
# already qualify on this machine right now):
# 1. Click the ▾ arrow next to that workspace's number in the bar.
# 2. Note which window is focused before clicking a row:
hyprctl activewindow -j | jq '{address, title}'
# 3. Click a *different* row in the flyout than the one bulleted.
# 4. Re-run the same hyprctl command.
```

Pass looks like:
1. The flyout opens listing every window on that workspace, in the same
   order `hyprctl clients -j | jq '[.[] | select(.workspace.id==<id>) | .title]'`
   would show them scrolled (left-to-right).
2. Each row shows a title (or, for a window with no title yet, its app id;
   `"(untitled window)"` if it has neither) as the label, and its app id as
   the detail text.
3. The row matching step 2's `hyprctl activewindow` address is bulleted.
4. Clicking a different row closes the flyout and step 4's
   `hyprctl activewindow -j` address now matches the row that was clicked.
5. Closing that workspace down to one window makes the `▾` arrow disappear
   (and closes the flyout first, if it was left open).

## Comments

Two corrections to `spec.md`'s design decisions, both from live verification
against the running compositor (not assumed):

**`HyprlandToplevel.activate()` does not exist on the installed Quickshell
build (0.3.0).** spec.md cited `launcher/modules/Windows.qml:focusWindow`'s
`hyprland.activate()` call as confirming this method's presence, but that
call is itself an *unverified, `typeof`-guarded* fallback — its own comment
says so. A throwaway `quickshell -p` `Scope` probe (Hyprland's own
recommended technique, per the ADR) against live toplevels showed
`typeof toplevel.activate === "undefined"` and
`typeof toplevel.wayland.activate === "function"` for every window checked,
matching the `quickshell-hyprland-ipc.qmltypes` metadata (`HyprlandToplevel`
declares no `activate` method; `Toplevel`, the Wayland handle, does).
Implemented as `modelData.wayland.activate()`, guarded against a toplevel
whose Wayland handle hasn't linked yet (same async-linking gap
`launcher/modules/Windows.qml` documents), not the dead Hyprland-side
fallback.

**`Hyprland.activeToplevel` does not seed from an initial snapshot.**
Verified live: right after `quickshell -c dotfiles` starts (or reloads),
`Hyprland.activeToplevel` is `null` and every toplevel's own `.activated` is
`false` — including the actually-focused window — until a live
`activewindow`/`activewindowv2` IPC event fires post-startup. Unlike
`HyprlandMonitor.lastIpcObject.specialWorkspace`, which `Workspaces.qml`
already seeds from a snapshot for exactly this reason (see its
`Component.onCompleted` comment), Quickshell's Hyprland IPC module exposes
no query/refresh method for the active toplevel (only
`refreshMonitors`/`refreshWorkspaces`/`refreshToplevels`) — there is nothing
to seed it from. Consequence: right after the bar (re)starts, no flyout row
is bulleted until the user's focus changes once, even on a window that was
already focused. Left as-is rather than building new seeding machinery this
ticket didn't ask for; worth its own ticket if it proves annoying in
practice.

`tiledLayout` itself was re-confirmed live and needed no correction: reads
correctly through `lastIpcObject.tiledLayout` in the real running bar,
matching `hyprctl workspaces -j` and the ADR's existing claim.

Full suite (`node --test "tests/**/*.test.js"`) passes at 401/401,
unchanged — no automated coverage for this ticket's QML, per spec.md's
Testing Decisions.

**Host verification (2026-08-09):** the user ran the `## Manual
verification` block above against the live bar and confirmed all four pass
criteria: (1) the flyout opened listing windows in scroll order with correct
titles/fallback names, (2) the row matching the pre-click
`hyprctl activewindow -j` address was bulleted, (3) clicking a different row
switched focus (confirmed post-click via the same command) and closed the
flyout, (4) closing a workspace down to one window made the arrow (and any
open flyout) disappear. All five ticket checkboxes ticked; ticket closed.
