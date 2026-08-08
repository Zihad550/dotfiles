# Dead / commented-out code in hypr/lua and bin

Status: needs-triage

## Problem

Comment-density scanning during the `launcher/` cleanup (see `../spec.md`) turned
up a different pattern in `hypr/.config/hypr/lua/` and `bin/`: not narrative
prose, but blocks of commented-out code — disabled alternate config, old
implementations kept inline, stray debug lines.

Examples found so far:

- `hypr/.config/hypr/lua/monitors.lua` (65% comment density) — several
  fully-commented-out alternate monitor-layout blocks (horizontal primary,
  vertical primary/secondary, etc.) alongside the one `[ACTIVE]` layout in use.
- `hypr/.config/hypr/lua/bindings/utilities.lua` — one commented-out dictation
  keybind (`SUPER + CTRL + V`), explained inline as disabled due to a keybind
  collision.
- `bin/df-zellij-f` (52% comment density) — several commented-out lines inside
  the live logic (an alternate `pgrep`-gated branch, alternate `zellij action`
  calls), plus one commented-out alternate implementation using `yazi`.

Not touched during the `launcher/` pass because this isn't a "trim the prose"
job — deciding what to do with each block needs the user's own knowledge of
which alternates are still wanted (e.g. is the vertical-monitor layout in
`monitors.lua` a live option someone still swaps to, or stale?).

## Possible directions (not decided)

- Delete blocks confirmed stale, keep ones confirmed still-swapped-to on
  purpose — but each needs a call from the user, not an inference from the code.
- For layouts/configs someone does still switch between, consider a named
  alternative (e.g. separate files, or a config flag) instead of
  comment/uncomment, so the "current" one isn't ambiguous by inspection.

## Manual verification

None yet — this needs triage (which blocks are load-bearing) before any work
starts, and that triage is the user's call, not inferrable from the repo alone.
