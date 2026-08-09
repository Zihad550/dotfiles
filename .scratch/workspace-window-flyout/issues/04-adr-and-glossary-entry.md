# 04 — ADR + glossary entry for the workspace window flyout

**What to build:** the documentation record for two decisions a future
reader would otherwise have to re-derive from scratch: that `tiledLayout` is
only knowable through live Hyprland IPC (not a named Quickshell property, and
verified live rather than assumed), and that `bin/df-hypr-workspace-layout-toggle`
is currently broken on this Hyprland build — which is why the feature treats
a workspace's layout as fixed for the bar's running session. Plus a
`CONTEXT.md` Bar-section glossary term, **Flyout**, naming the
popup-under-a-bar-entry pattern ticket 01 built and ticket 03 reused.

**Blocked by:** 01 (Extract shared Flyout component from SpecialWorkspaces),
03 (Scrolling-workspace window flyout)

**Status:** done

- [x] New ADR under `docs/adr/` (next sequential number) recording: why
      `tiledLayout` is read via `lastIpcObject` rather than a named property,
      that this was verified live against the running compositor rather than
      assumed, the broken-toggle-script finding, and its consequence (layout
      membership treated as fixed for the bar's session, not watched live)
      — `docs/adr/0005-workspace-tiled-layout-live-ipc.md`
- [x] `CONTEXT.md`'s Bar section gains a **Flyout** term with an `_Avoid_`
      list, worded to stay distinct from the Launcher section's `Chooser`
      and `Page`
- [x] No code changes — docs only

## Manual verification

None — this ticket is docs-only, and every claim in the ADR was re-verified
live against this session's running compositor before being written down
(not just re-stated from `spec.md`):

- `hyprctl version` → `Hyprland 0.56.2`
- `hyprctl workspaces -j | jq '[.[] | {id, tiledLayout}]'` → returned a
  `tiledLayout` field (`"scrolling"`/`"dwindle"`) per workspace, confirming
  the field is live on this build
- `pacman -Q quickshell` → `quickshell 0.3.0-2`, the build the spec's probe
  ran against
- `bin/df-hypr-workspace-layout-toggle` read (not executed, to avoid
  mutating the live session): confirmed it calls
  `hyprctl keyword workspace $ID, layout:$LAYOUT`, consistent with the
  "non-legacy parsers, use eval" rejection the ADR records

Ticket 03 (the feature itself) is still `ready-for-agent` — no file under
`quickshell/.config/quickshell/dotfiles/` reads `tiledLayout` yet. This
ticket proceeds ahead of it anyway since it's docs-only and every decision
it records was already finalized in `spec.md`, independent of 03's code
existing.
