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

**Status:** ready-for-agent

- [ ] New ADR under `docs/adr/` (next sequential number) recording: why
      `tiledLayout` is read via `lastIpcObject` rather than a named property,
      that this was verified live against the running compositor rather than
      assumed, the broken-toggle-script finding, and its consequence (layout
      membership treated as fixed for the bar's session, not watched live)
- [ ] `CONTEXT.md`'s Bar section gains a **Flyout** term with an `_Avoid_`
      list, worded to stay distinct from the Launcher section's `Chooser`
      and `Page`
- [ ] No code changes — docs only
