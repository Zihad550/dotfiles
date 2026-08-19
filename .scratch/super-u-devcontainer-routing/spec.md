# SUPER+U Follows Devcontainer Routing

**Status:** ready-for-agent

## Problem Statement

`SUPER+U` is the one call site that opts out of Devcontainer Routing. Every
other consumer — the Launcher's Herdr, Zed, VSCode, Cursor and Neovim chooser
entries — consults the toggle and routes a Mirrored Directory to the
devcontainer host. `SUPER+U` alone passes `--local` to `bin/df-herdr-session`,
which skips the toggle and the allowlist entirely and always takes the local
branch.

That opt-out was deliberate (`docs/adr/0003-tmux-to-herdr.md`), on the grounds
that silently upgrading a "just give me a terminal" keybind into an SSH session
would be surprising. In practice it is the opposite: with routing on, the
scratch session `SUPER+U` opens is the one place work is *not* happening, and
the toggle's promise — that "on" means one consistent thing everywhere
(devcontainer-routing-toggle spec, story #4) — is broken by its most-used
keybind.

## Solution

`SUPER+U` stops passing `--local`, and the flag is deleted from
`bin/df-herdr-session` along with it. The keybind then resolves routing the
same way every other call site does: routed when Devcontainer Routing is on
**and** the path is a Mirrored Directory. `~/dotfiles` is already in the
allowlist, so with routing on `SUPER+U` opens
`herdr --remote <host> --session herdr` against the host Quick Settings
configured; with routing off it opens the local session exactly as it does
today.

The routed launch passes no directory. `herdr --remote` has no equivalent of
`tmux new-session -c` (verified against `herdr --help`), so the remote session
opens wherever the remote server's own session sits. This is the same gap
`docs/adr/0003-tmux-to-herdr.md` already recorded for the Launcher's Herdr
entries, carried forward unchanged rather than worked around.

The window keeps one identity — initial class
`io.github.zihad550.dotfiles.herdr`, Special Workspace `herdr`, session name
`herdr` — in both the local and the routed case. `df-launch-special-workspace`
focuses an existing window before `df-herdr-session` ever runs, so an open
herdr window is focused regardless of the toggle: switching modes means closing
it first. Nothing kills or replaces a live session on the user's behalf.

An unreachable host fails loudly. There is no pre-flight SSH probe and no
silent fallback to a local session.

## User Stories

1. As someone with Devcontainer Routing on, I want `SUPER+U` to open a herdr session on the devcontainer host, so that the keybind I reach for lands where my work actually is.
2. As someone with Devcontainer Routing off, I want `SUPER+U` to open the local `~/dotfiles` session exactly as it does today, so that turning the feature off costs me nothing.
3. As someone who has set a custom devcontainer host in Quick Settings, I want `SUPER+U`'s routed session to use it, so that there is still one place that decides which host "the devcontainer" means.
4. As someone with routing on and no custom host set, I want `SUPER+U` to route to `devcontainer.devpod`, so that adopting this change requires no configuration.
5. As someone whose `SUPER+U` session is routed, I want the herdr session named `herdr` on the remote just as it is locally, so that `herdr session list` and my muscle memory read the same in both modes.
6. As someone with a herdr window already open, I want `SUPER+U` to focus it whatever the toggle says, so that a keybind meant to summon a window never destroys a session running in one.
7. As someone switching modes, I want closing the herdr window and pressing `SUPER+U` again to be the whole procedure, so that there is one obvious way to get the other mode.
8. As someone with routing on and an unreachable devcontainer, I want the failure to be visible rather than a silent local session, so that I never mistake a fallback for the container.
9. As someone reading `bin/df-herdr-session`, I want no `--local` flag that nothing passes, so that the script's routing logic has exactly one path through it.
10. As a future maintainer diffing this against ADR 0003's "SUPER+U forces local", I want an ADR saying why that reversed, so that it reads as a decision and not a regression.
11. As someone maintaining `bin/df-herdr-session`, I want its routing branches covered by tests, so that host resolution and the allowlist can't break silently in a script only a keybind exercises.

## Out of Scope

- **A second window identity for routed sessions.** Considered and rejected; see `docs/adr/0007-super-u-follows-devcontainer-routing.md`.
- **Killing or replacing a mismatched herdr window** — from `SUPER+U` or from the Quick Settings toggle.
- **A pre-flight SSH reachability probe**, and any local fallback derived from one.
- **Setting the routed session's working directory.** Not expressible through `herdr --remote`.
- **Consolidating the `MIRRORED` allowlist** duplicated between `bin/df-herdr-session` and the Launcher's `directories.js` — deferred by ADR 0002, reaffirmed by ADR 0003, still deferred here.
