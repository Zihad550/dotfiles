# Herdr replaces tmux as the desktop's wired-in multiplexer

Herdr — an agent-aware terminal workspace manager with its own socket API,
agent detection, and persistent sessions — has already been adopted piecemeal:
`herdr/.config/herdr/config.toml` was hand-ported from tmux's keybindings,
`setup/common/setup-herdr` installs it and its agent integrations, and it's
already wired into `setup/arch-devbox/init`. What was still missing was
everything downstream of the config: the Launcher's directory-opening entry,
theme switching, and the devcontainer-routing session script all still
targeted tmux.

This finishes that migration on the two GUI desktop profiles
(`arch-hyprland`, `arch-devbox`) only. `tmux` stays installed and fully
configured as an inert fallback; nothing in the repo calls it anymore.

## Why

**Desktop profiles only, not every profile.** `ubuntu-devbox`,
`ubuntu-server`, and `proxmox` install plain `tmux` with no theming, no
Launcher, and no devcontainer routing built on top of it — there's no
integration surface to migrate there, and adopting an agent-aware,
GUI-adjacent tool on headless remote boxes nobody asked for is a separate
decision from finishing this one.

**The `tmux` package and its config stay, but only as an unused fallback.**
`tmux/.tmux.conf`, `tmux.reset.conf`, and `new-window-ssh-aware.sh` are left
exactly as they are — a fully working, manually-usable multiplexer if herdr
ever needs to be worked around. But `bin/df-tmux-session` and
`bin/df-restart-tmux` are deleted rather than kept alongside their herdr
replacements: an orchestration script nothing calls is worse than no script
at all, since it still carries a live copy of the devcontainer-routing
allowlist that would silently drift from the real one (in the Launcher and
the new herdr script) the moment either changes. Config files carry no such
risk — they're inert data, not logic that can go stale in a way that misroutes
anything.

**The devcontainer-routing duplication is carried forward unchanged.**
ADR 0002 already named the two-copies-of-the-allowlist problem between
`directories.js` and the session script as a known, deliberately unfixed
wart. Rewriting the session script for herdr is not the occasion to also
consolidate that — bundling "swap the multiplexer" with "fix a duplication
the last ADR explicitly deferred" would tangle two independent changes into
one diff.

**Devcontainer routing becomes two separate launches, not one session with
two windows — this supersedes ADR 0002's story #11.** tmux's script ran one
session with two windows: one running `ssh -t host "cd path; exec $SHELL"`,
one plain local shell. Herdr has no equivalent of "one pane just runs ssh
inside a shared session" for this: `herdr --remote <target>` attaches the
*entire* client to a **different herdr server** running on the far end
(bootstrapping it over ssh itself if it isn't already running) — a
fundamentally different shape from a single pane's command. So the routed
case now opens as its own independent `herdr --remote <host> --session <name>`
launch, no bundled local companion tab, the same way Zed's separate "Connect
via SSH" profile has always worked (spec item 18 of the routing-toggle spec).
This is a deliberate behavior change from "the same two-window session I get
today" (ADR 0002 story #11) — a future reader diffing behavior against that
story should read this as the reason, not a regression.

**No devcontainer-image provisioning added here.** `herdr --remote` prompts
to install itself on the remote if it isn't already present, so this
migration doesn't need to (and doesn't) touch anything about how the
devcontainer image is built.

**SUPER+U forces local (`--local`), the Launcher's Herdr entries don't.**
Once routing was live, `SUPER+U` inherited the same allowlist re-check as
every other call site — but it's a fixed scratch-session shortcut for
`~/dotfiles`, not a deliberate per-directory choice the way opening a
specific directory from the Launcher is. Silently upgrading a "just give me
a terminal" keybind into an SSH session the moment routing happens to be on
elsewhere was surprising, not useful, so `bin/df-herdr-session` grew a
`--local` flag (must come first) that skips the toggle/allowlist check
entirely and always takes the local branch. Only `apps.lua`'s `SUPER+U`
binding passes it; the Launcher's `herdrLaunchArgv` does not, so opening a
mirrored directory from the Launcher still routes when the toggle is on.

*Superseded by `docs/adr/0007-super-u-follows-devcontainer-routing.md`:*
*`SUPER+U` now follows the toggle like every other call site, and `--local`*
*is deleted.*

## Consequences

- `bin/df-herdr-session` replaces `bin/df-tmux-session`: same allowlist/host
  resolution as before, but branches into `herdr --session <name>` (local,
  cwd via `cd`) or `herdr --remote <host> --session <name>` (routed) instead
  of tmux's has-session/new-session/new-window state machine.
- `bin/df-restart-herdr` replaces `bin/df-restart-tmux`, but can't just call
  bare `herdr server reload-config` the way it might look: that only ever
  reaches the *default* socket (`~/.config/herdr/herdr.sock`), and every
  session actually in use is a *named* one (`herdr --session <name>`) with
  its own socket under `~/.config/herdr/sessions/<name>/` — host-verified
  that reloading the default socket silently no-ops while real running
  sessions never see the new config. So it reloads every session
  `herdr session list --json` reports as `running`, via `HERDR_SOCKET_PATH`
  per session, not just the default.
- `themes/templates/tmux.conf.tpl` and all 13 per-theme `tmux.conf` files are
  deleted; `df-theme-set` drops its tmux-theme symlink step. Herdr's config
  already follows the host terminal's ANSI palette (`theme.name = "terminal"`)
  specifically so `df-theme-set` needs no per-theme herdr file either.
- The Launcher's `"Tmux"` chooser entry becomes `"Herdr"` in `directories.js`;
  `tmuxLaunchArgv` becomes `herdrLaunchArgv` and its comments move to herdr's
  own workspace/tab vocabulary.
- The remote session's working directory is not directly controllable through
  `herdr --remote` the way `tmux new-session -c` controlled it — the routed
  case opens wherever the remote server's own session defaults to, not
  necessarily `path`. Not solved here; noted in `bin/df-herdr-session` as a
  known gap.
- `bin/df-herdr-session` cannot rely on `PATH` to find `herdr` at all.
  Hyprland's own exec (`hl.dsp.exec_cmd`, what both `SUPER+U` and the
  Launcher route through) hands spawned processes a bare `/usr/bin`-only
  `PATH` — `~/.local/bin`, where mise's `herdr` shim lives (`zsh/.zshenv`),
  is never on it, unlike a shell-launched command. `/usr/bin/tmux` being on
  that minimal `PATH` is exactly why tmux never had this problem. Under
  `set -e` this failed completely silently — empty `HERDR_BIN`, script exits
  before printing anything, ghostty shows a blank window with just a generic
  "Command failed" banner — so `bin/df-herdr-session` now falls back to
  known install paths and errors loudly (exit 127, message on stderr) if
  `herdr` truly can't be found, rather than dying silent.
- Live host probing confirmed that a bare `--class=herdr` remains ineffective:
  Ghostty rejects a non-dotted application identity and Hyprland reports the generic
  `com.mitchellh.ghostty` class. A valid dotted identity does work, however.
  The fixed `SUPER+U` window now launches with
  `io.github.zihad550.dotfiles.herdr`, which Ghostty exposes through both its
  initial and current class fields. The Special Workspace launcher selects
  the exact initial class only; the visible `herdr` title is not identity.
  Launcher-created Herdr terminals pass no class and remain ordinary Ghostty
  windows.
- `[ui].prompt_new_tab_name = false` in `config.toml`: tmux's `new-window`
  never asked for a name either, so herdr's default confirmation prompt
  (asking for a tab name before creating one) is switched off to match —
  new tabs get herdr's generated name immediately, same muscle memory as
  before.
- `zsh/.config/zsh/herdr-rename.zsh` ports tmux's `automatic-rename` /
  `automatic-rename-format` (dir basename, `(command)` while one's running).
  Herdr has no built-in equivalent and no config toggle for it — only
  third-party plugins that hook every command via a shell integration, which
  is no smaller a shell hook than writing the ~40 lines directly against
  `HERDR_TAB_ID`/`herdr tab rename`, so it's done in-repo instead of adding
  a plugin dependency. Manual renames (`prefix+r`) are detected and left
  alone by comparing the live label against the one this hook last set.

## Superseded scope

The headless carve-out in the opening decision — and the dependent claim that
tmux remains installed as an inert fallback there — is superseded by
[ADR 0029](0029-headless-profiles-use-herdr.md). Its substantive Herdr
decisions, including routing, path fallback, and the rename hook, still stand.

The remaining desktop fallback clause is superseded by issue #121. No supported
profile installs or stows tmux now, and the old `tmux/` config is removed from
`main`. The complete config remains recoverable on the pushed
`archive/tmux` branch under the archive policy in [ADR 0021](0021-retired-setup-files-move-to-an-archive-branch.md).
