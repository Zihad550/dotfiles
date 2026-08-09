# 01 — Extract shared Flyout component from SpecialWorkspaces

**What to build:** `SpecialWorkspaces`' existing popup chrome — the
`PopupWindow`, the `HyprlandFocusGrab`, the open/close reopen-debounce, and
the bordered `Column` of `MenuRow`s — comes out into a new standalone,
reusable `Flyout` component parameterized by a model and a row delegate.
`SpecialWorkspaces` is rewired onto it. From the user's side nothing changes:
the collapsed bar entry, the dropdown it opens, and everything in it look and
behave exactly as they do today. This is the prefactor that ticket 03 builds
on, so the second consumer of this chrome doesn't mean copying ~70 lines a
second time.

**Blocked by:** None — can start immediately

**Status:** needs-info

- [x] A new `Flyout` component exists, taking a model and a row delegate (or
      equivalent), reproducing the `PopupWindow` / `HyprlandFocusGrab` /
      reopen-debounce / bordered-`Column` chrome currently inlined in
      `SpecialWorkspaces`
- [x] `SpecialWorkspaces` is rewired to use `Flyout` instead of its own
      inline popup; no other file changes behavior
- [ ] (Host-only — with two or more special workspaces open, the collapsed
      entry's label, the bullet on the currently-open one, each row's
      `"N windows"` detail text, click-to-activate on a row, and
      dismiss-on-outside-click all still match pre-refactor behavior exactly)

## Manual verification

This session turned out to have a live compositor (not the no-Wayland
devcontainer `docs/agents/issue-tracker.md` describes), so the load-level and
single-workspace checks below are already done, not just inspected:

- `quickshell -c dotfiles log` shows a clean `Reloading configuration...` /
  `Configuration Loaded` pair with no warnings or errors after this branch's
  edits landed — confirms `Flyout.qml` parses and `SpecialWorkspaces.qml`'s
  rewiring resolves (no `model`/`delegate` collision with `PopupWindow`, no
  binding loop from `width: parent.width`).
- A `grim` screenshot of the bar with the current single special workspace
  (`special:herdr`) open shows the collapsed entry rendering exactly as
  before (bold `herdr`, no dropdown arrow, since `collapsible` requires 2+).

What's left needs two or more special workspaces open at once, which this
session didn't have and shouldn't manufacture unattended (it means launching
apps in your live session):

```
# Open a second special workspace alongside the existing one (SUPER+U
# already opened "herdr"; SUPER+O opens "obsidian" as a second one):
# press SUPER+O, then SUPER+O again to toggle it open if it starts closed
```

Pass looks like:
1. The bar's collapsed entry shows a `▾`/`▴` arrow next to the name once a
   second special workspace exists (it didn't with only one open).
2. Clicking the entry opens a dropdown listing both, current one on top,
   with a `•` bullet next to whichever is actually open and each row
   reading `"N windows"`.
3. Clicking a row switches to that workspace and the dropdown closes.
4. Clicking anywhere outside the dropdown closes it without switching
   workspaces.

All four are unchanged from pre-refactor `SpecialWorkspaces` behavior (the
`Flyout` extraction moved this chrome, it didn't rewrite it) — this check is
about confirming the move didn't silently drop something, not exploring new
behavior.
