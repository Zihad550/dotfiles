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

**Status:** ready-for-agent

- [ ] A new `Flyout` component exists, taking a model and a row delegate (or
      equivalent), reproducing the `PopupWindow` / `HyprlandFocusGrab` /
      reopen-debounce / bordered-`Column` chrome currently inlined in
      `SpecialWorkspaces`
- [ ] `SpecialWorkspaces` is rewired to use `Flyout` instead of its own
      inline popup; no other file changes behavior
- [ ] (Host-only — no compositor in the devcontainer, hand off as
      `needs-info` per `docs/agents/issue-tracker.md`) With two or more
      special workspaces open, the collapsed entry's label, the bullet on
      the currently-open one, each row's `"N windows"` detail text,
      click-to-activate on a row, and dismiss-on-outside-click all still
      match pre-refactor behavior exactly
