# Devcontainer Routing Toggle

**Status:** ready-for-agent

## Problem Statement

Opening a mirrored directory from the Launcher, or pressing `SUPER+U` for a
tmux session, both reach into the devcontainer over SSH — the Launcher only
for paths under a fixed allowlist, tmux unconditionally, for any path at all.
Neither ever asks first. Working normally, entirely on the host, is not a
choice available anywhere in the keybindings — it's simply what used to
happen before devpod was set up, and there is no way back to it short of
editing scripts.

The two call sites don't even agree with each other today: the devcontainer's
SSH host is hardcoded twice, once in the Launcher's directories module and
once in the tmux session script, with a comment in the latter admitting it's
only "kept in sync" by hand.

## Solution

A single, shared, persisted toggle — off by default — gates every place this
repo automatically routes into the devcontainer. Off, everything behaves as
if the feature doesn't exist: no SSH, no devpod auto-start triggered, plain
local windows and files. On, the Launcher and the tmux keybind both route
exactly as they do today, using a shared default host, or a hostname
explicitly configured instead.

The switch lives as a row in Quick Settings, alongside Tailscale's. The
Launcher's existing mirrored-path allowlist (`~/dev`, `~/dotfiles`,
`~/.agents`) keeps working as an independent, second gate, so turning routing
on never sends a directory the devcontainer doesn't have mounted. The tmux
session script gains that same allowlist check for the first time — today it
has none at all.

Zed's separate, manually-invoked "Connect via SSH" profile is untouched; this
feature is about *automatic* routing only.

## User Stories

1. As someone who wants to work locally today, I want devcontainer routing off by default, so that a fresh checkout of these dotfiles never SSHes anywhere without me asking it to.
2. As someone who has turned routing off, I want it to stay off across reboots and new terminal sessions until I turn it back on, so that flipping it once is enough.
3. As someone about to start devcontainer work, I want a single switch in Quick Settings, so that I don't have to remember which of several tools to toggle.
4. As someone flipping the switch on, I want the Launcher, the tmux keybind, and Zed's automatic routing to all start using the devcontainer together, so that "on" means one consistent thing everywhere.
5. As someone flipping the switch off, I want the Launcher, tmux, and Zed's automatic routing to all stop reaching for the devcontainer together, so that "off" truly means "act normal everywhere."
6. As someone who hasn't set a custom host, I want routing (when on) to use the existing `devcontainer.devpod` target, so that the feature doesn't change my current setup by default.
7. As someone running a different devpod workspace, or pointed at a plain remote box, I want to provide a hostname to SSH into instead of the default, so that the toggle isn't locked to one specific devcontainer.
8. As someone who has set a custom hostname and later clears it, I want routing to fall back to `devcontainer.devpod` automatically, so that removing the override doesn't leave routing broken.
9. As someone opening a directory from the Launcher that isn't under `~/dev`, `~/dotfiles`, or `~/.agents`, I want it to open locally regardless of the toggle, so that turning routing on doesn't suddenly try to SSH a directory the devcontainer never mounted.
10. As someone pressing `SUPER+U` with routing off, I want only the local tmux window, no SSH attempt at all, so that a stopped devpod workspace never gets woken up by a keybind I didn't mean as "go work in the container."
11. As someone pressing `SUPER+U` with routing on, for a path the allowlist covers, I want the same two-window session I get today, so that turning the feature on doesn't regress the existing tmux flow.
12. As someone reaching tmux with routing on for a path outside the allowlist (directly or through the Launcher's chooser), I want just the local window, so that tmux respects the same "does the devcontainer actually have this" rule the Launcher already enforces.
13. As someone glancing at Quick Settings, I want the devcontainer row to show whether routing is on or off, so that I don't have to open a directory just to find out which mode I'm in.
14. As someone glancing at Quick Settings with routing on, I want to see which host it's pointed at, so that a custom hostname I set a while ago isn't a surprise the next time something opens remotely.
15. As someone who just flipped the switch, I want the change to apply the moment I next open a directory or tmux session, so that I don't have to restart anything for it to take effect.
16. As someone with a session already open in the devcontainer, I want flipping the switch off to leave that session alone, so that turning routing off doesn't yank a window out from under me mid-work.
17. As someone editing the custom-hostname file by hand, I want a blank or missing file to mean "use the default," not an error, so that clearing it is as simple as deleting a line.
18. As someone using Zed's own "Connect via SSH" picker, I want the saved `devcontainer.devpod` profile to keep working regardless of the toggle, so that a deliberate manual connection isn't affected by a switch meant for automatic routing.
19. As someone who has never touched this feature, I want directories and tmux sessions I opened before this feature shipped to behave exactly as before once I turn the toggle on with no custom host set, so that adopting the feature costs nothing if I don't change anything.
20. As a future maintainer reading `bin/df-tmux-session` or the Launcher's directories module, I want one source of truth for the SSH host, so that I'm not risking two hardcoded copies drifting out of sync the way they do today.
21. As someone who never installed devpod, I want the toggle to exist without doing anything harmful, so that the feature doesn't assume a devcontainer is actually present.
22. As someone turning routing on with a devpod workspace currently stopped, I want the same auto-start-on-`ssh` behavior that exists today, so that flipping the switch plus opening a mirrored directory is enough to reach a running container.
23. As someone who wants to confirm the toggle actually worked, I want a manual verification block for each surface it touches, so that I can trust a ticket that claims "done" rather than one arguing "the code looks right."
24. As someone reading this spec later, I want it on record that per-tool granularity was considered and rejected in favor of one shared switch, so that nobody re-proposes splitting it per surface without knowing why it wasn't built that way.

## Implementation Decisions

**Two state files under `~/.local/state/dotfiles/`, both read by every
consumer at the moment it acts — never cached, never an environment
variable.** An env var set in one shell doesn't reach a daemon-launched tab or
an already-running Quick Settings process, so a file both a QML process and a
fresh bash invocation can independently read is the only mechanism that
reaches all of them:

| State | Contract |
| --- | --- |
| Enabled | `toggles/devcontainer-routing` — presence, not content, is the signal. Same existence-flag idiom already sketched (unused) for `df-theme-set-vscode`'s VS Code skip flag. Present = on. |
| Custom host | `devcontainer-host` — single line, trimmed. Present and non-empty overrides the default; missing, empty, or unreadable falls back to `devcontainer.devpod`. |

**The Launcher's pure decision logic stays pure.** `isMirrored` is untouched
— it keeps answering only the structural question ("does the devcontainer
have this path mounted"), unrelated to the toggle. `defaultOpenArgv`,
`chooserApps`, and `sshUrlFor` take the resolved routing decision (mirrored
**and** enabled) and the resolved host as explicit parameters rather than
reaching for a hardcoded host constant. Reading the two state files happens
where file reads already happen for this module — the QML layer — and gets
handed in as plain values, the same boundary `parseCache` already draws
against the directory cache file.

**`bin/df-tmux-session` gains its own copy of the mirrored-path allowlist,
deliberately.** It has two independent callers — the Launcher's Tmux chooser
entry, and the `SUPER+U` keybinding, which invokes it directly with no
computed routing decision at all. The script has to be able to decide for
itself, so it reads both state files and re-checks the allowlist rather than
trusting a flag passed in. The three-entry allowlist duplicated across a JS
array and a bash case statement is accepted as a small, stable exception —
the state *files* are the shared source of truth this work introduces; the
allowlist was never shared to begin with, and sharing it would mean a config
format neither side currently needs.

**Quick Settings gains a `DevcontainerRoutingRow`, following the
`TailscaleRow`/`MenuRow` shape.** Unlike Tailscale, there is no daemon status
to stream — the state is just a file's existence and contents — so no
long-lived `Process` is needed. The row's `detail` text shows the resolved
host when on (the custom host if set, otherwise `devcontainer.devpod`) and
is blank when off, giving the "which host" story (13/14) a place to live
without a live text field in the panel (that was explicitly considered and
declined — see Out of Scope).

**No dynamic detection is added.** Whether devpod is installed, whether a
container is running, whether `devcontainer.json` exists in the current
project — none of that is consulted. This mirrors the feature's current,
purely static behavior; the toggle is a manual decision, not an inferred one.

## Testing Decisions

**The Launcher's pure module is the one automated seam, extended in place.**
`tests/launcher/directories.test.js` and `tests/launcher/files.test.js`
already cover `isMirrored`, `defaultOpenArgv`, `chooserApps`, and
`sshUrlFor` against a plain `node --test` runtime, free of QML — the highest
seam available for this feature, and the only one already proven out in this
repo for exactly this module. New cases to add:

- Routing disabled: `defaultOpenArgv` and `chooserApps` return purely local
  argv for a mirrored path, identical to what an unmirrored path returns
  today — the toggle overrides `isMirrored` rather than being layered on top
  of it.
- Routing enabled, no custom host: output is byte-for-byte what today's
  hardcoded-`SSH_HOST` behavior produces, so existing behavior regresses to
  nothing when the toggle defaults differently.
- Routing enabled, custom host: the `ssh://` URL and every `--remote
  ssh-remote+<host>` argv reflect the custom host, not the default.
- `isMirrored` itself is asserted unchanged by any of the above — still a
  function of path and `$HOME` alone.

Reading the state files themselves is **not** part of this seam, the same
way reading the real directory cache off disk isn't — `parseCache` is tested
against a string, not a file, and the new routing/host parameters are tested
the same way: as already-resolved values handed in, not as file reads this
suite performs.

**`bin/df-tmux-session` has no automated harness, by existing precedent** —
ticket 03 (the original session script) shipped with `## Manual
verification` blocks only, no test file, because the container this work
runs in has no real `tmux`/`ssh` to exercise. The new toggle-and-allowlist
gate gets the same treatment: a verification block covering routing off (no
SSH attempt, local window only), routing on with a mirrored path (unchanged
two-window session), routing on with an unmirrored path (new: local-only,
where today it always SSHed), and a custom host (the SSH window targets it).

**The Quick Settings row is manual-verification-only, host-only, same as
every other bar/panel feature in this repo (see `docs/adr/0001`, the
Wi-Fi work).** The container running agent work has no compositor, no
Wayland session, and no `quickshell` binary — any ticket reaching a runtime
checkbox here is set to `needs-info` and handed to the user rather than
ticked from "the code looks right."

## Out of Scope

- **Per-surface toggles.** One shared switch only; a per-tool matrix was
  considered and rejected (see the ADR).
- **A live hostname text field inside the Quick Settings row.** The custom
  host is set by hand-editing its state file; an in-panel editable field was
  considered and declined as real QML work for something set rarely.
- **An env var or CLI interface for the toggle.** Quick Settings is the only
  surface; the underlying state file can still be edited by hand, but no
  command is built to do it.
- **Dynamic detection of devpod/devcontainer state.** No check for whether
  devpod is installed, a container is running, or `devcontainer.json`
  exists — the toggle remains a manual decision.
- **Updating Zed's `ssh_connections` entry to track a custom host.** It stays
  a static, manually-invoked profile, untouched by this feature.
- **Choosing among multiple devcontainer workspaces from the UI.** One
  configurable host at a time; switching workspaces means editing the host
  file.
- **Retroactively affecting already-open sessions or windows.** The state is
  read at the moment something is launched; nothing already running is
  migrated or torn down when the toggle changes.

## Further Notes

"Devbod," as named when this feature was requested, doesn't appear anywhere
in the codebase — it's devpod, the actual tool (`devpod up`, `devpod ssh`,
documented in `AGENTS.md`'s `resources/devpod`), and `devcontainer.devpod` is
exactly the SSH-proxy alias format devpod generates for a workspace.

The duplicated `SSH_HOST` this work removes was already flagged in the
codebase's own comments — `bin/df-tmux-session` says outright it's "kept in
sync" with the Launcher's directories module by hand. That duplication, and
the complete absence of any existing on/off mechanism, is recorded as an
architecture decision in `docs/adr/0002-devcontainer-routing-toggle.md`,
since a future reader would otherwise reasonably wonder why routing wasn't
already gated by something.
