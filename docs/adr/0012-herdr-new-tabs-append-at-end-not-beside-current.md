# Herdr's new tabs append at the end, not beside the current tab

Issue #83: wanted a new Herdr tab to open immediately to the right of the
currently focused tab (Kitty's `neighbor` placement — `A | B | C`, focus `B`,
new tab gives `A | B | New | C`). Herdr always appends the new tab after the
highest-numbered existing tab instead, regardless of which tab is focused —
confirmed by creating and closing a probe tab against a live session (v0.8.0)
with a non-last tab focused, and unchanged in the latest release (v0.8.2).
No workaround is possible: `herdr tab create` has no `--position`/`--after`
flag, and there is no `tab move`/`tab reorder` verb at any layer (CLI, socket
API, or config) — the only way to reposition a tab at all is a mouse drag in
the UI, which isn't scriptable or keybindable.

## Why

**Herdr is third-party and pull-only for us.** `herdrdev/herdr` is Apache-2.0
and public, but we have no push access — there's no code change in this repo
that can make new tabs open beside the current one. That closes the "build a
workaround" branch outright rather than leaving it silently unexamined.

**The exact idea is already filed upstream, unanswered.**
[`herdrdev/herdr` discussions#2932](https://github.com/herdrdev/herdr/discussions/2932)
requests this precise behavior (filed 2026-08-18, 0 comments, 1 upvote, no
maintainer response as of this ADR). We're not adding our own voice to it for
now — this ADR exists so the want and the current limitation are on record
here without that depending on upstream ever responding.

## Consequences

- No code or config change in this repo; `herdr/.config/herdr/config.toml`
  gains no new keybinding, since there is nothing in Herdr for one to call.
- Issue #83 is closed as not actionable in this repo, linking here.
- Revisit if Herdr ships create-time tab positioning, or a `tab.move`/
  `tab.reorder` verb (the latter previously proposed and rejected-to-Discussions
  as [`herdrdev/herdr` discussions#771](https://github.com/herdrdev/herdr/discussions/771),
  which would at least allow a scripted move-after-create workaround).
