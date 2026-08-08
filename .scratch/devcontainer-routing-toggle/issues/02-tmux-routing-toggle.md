# 02 — tmux keybind respects the routing toggle + allowlist + custom host

**What to build:** Pressing `SUPER+U`, or opening the Launcher's Tmux
chooser entry, reads the same two devcontainer routing state files (see
ticket 01 and `docs/adr/0002-devcontainer-routing-toggle.md`)
independently, and gains the mirrored-path allowlist check it has never
had — today it opens an SSH window into `devcontainer.devpod`
unconditionally, for any path at all.

With the enabled flag absent: only the local tmux window opens, no SSH
attempt at all — nothing wakes a stopped devpod workspace. With the flag
present and the path under the mirrored allowlist (`~/dev`, `~/dotfiles`,
`~/.agents`): the same two-window session as today. With the flag present
and the path outside the allowlist: local-only — this is new; the script has
never checked this before. With a custom host configured: the SSH window
targets that host instead of `devcontainer.devpod`.

This script has two independent callers — the Launcher's Tmux chooser and
the `SUPER+U` keybinding, which invokes it directly with no routing decision
computed for it — so it re-derives the decision itself rather than trusting
a flag passed in.

**Blocked by:** None — can start immediately

**Status:** done — all six checkboxes closed, the two real-devpod ones
verified on the host. See **Comments**.

- [x] With the enabled flag absent, running the script with stubbed
      `ssh`/`tmux` never invokes `ssh` at all — only the local window is
      created
- [x] With the flag present, path under the allowlist, no custom host: the
      stubbed `ssh` is invoked targeting `devcontainer.devpod`
- [x] With the flag present, path under the allowlist, custom host set: the
      stubbed `ssh` is invoked targeting the custom host instead
- [x] With the flag present, path outside the allowlist: the stubbed `ssh`
      is never invoked — local window only
- [x] Real devpod verification: routing off leaves a stopped workspace
      stopped (no auto-start triggered)
- [x] Real devpod verification: routing on connects the SSH window to the
      configured host, same as before this ticket when unconfigured

## Manual verification

The stub-based checks run inside the container (no real tmux/ssh needed —
same technique ticket 03 used for quoting). The last two need a host with a
real devpod workspace and tmux.

1. **Stubbed, routing off.**
   ```
   rm -f ~/.local/state/dotfiles/toggles/devcontainer-routing
   PATH="<dir with stub ssh/tmux>:$PATH" ~/dotfiles/bin/df-tmux-session test-off ~/dotfiles
   ```
   *Pass:* the stub `ssh` log shows no invocation.
2. **Real, routing off.**
   ```
   rm -f ~/.local/state/dotfiles/toggles/devcontainer-routing
   devpod stop devcontainer 2>/dev/null
   tmux kill-session -t test-real 2>/dev/null; ~/dotfiles/bin/df-tmux-session test-real ~/dotfiles
   ```
   *Pass:* one local window opens; `devpod status devcontainer` still shows
   stopped.
3. **Real, routing on.**
   ```
   touch ~/.local/state/dotfiles/toggles/devcontainer-routing
   tmux kill-session -t test-real2 2>/dev/null; ~/dotfiles/bin/df-tmux-session test-real2 ~/dotfiles
   ```
   *Pass:* window one is an SSH shell on `devcontainer.devpod` (or the
   configured custom host) inside `~/dotfiles`; window two is local.

## Comments

Implemented in `bin/df-tmux-session`: reads `toggles/devcontainer-routing`
(presence) and `devcontainer-host` (trimmed first line, blank/missing falls
back to `devcontainer.devpod`), and re-checks the mirrored allowlist
(`~/dev`, `~/dotfiles`, `~/.agents`) itself, per the spec's Implementation
Decisions — no flag passed in from either caller. Routed (enabled **and**
mirrored): the original two-window session, ssh command built the same way
as before. Not routed: a single local window only, where the script
previously always opened a second, ssh window regardless.

The four stub-based checkboxes were run inside the container with a stub
`ssh` and a stub `tmux` whose `new-session` evaluates the pane command it's
handed (the same technique ticket 03 used for quoting), so the ssh
invocation and its target host are observed directly rather than inferred
from the command string. All four passed. The remaining two need a real
devpod workspace and tmux, so they're left to the host per the Manual
verification block above.

Confirmed against `hypr/.config/hypr/lua/bindings/apps.lua`'s `SUPER + U`
binding: it passes `$HOME/dotfiles` as a plain resolved absolute path (no
`~`, no trailing slash), so `is_mirrored`'s exact-root case arm matches it
directly — no normalization needed for the one real caller that invokes this
script with no computed decision.

Code review (`/code-review`, fixed point `HEAD`) flagged two things, both
fixed: the custom host was interpolated into the remote command unquoted,
so a hostname containing a space in the state file would have been
word-split into two `ssh` arguments; it now goes through the same `sq`
quoting as the path. The file header comment also ran long against
CLAUDE.md's "a line or two" rule; trimmed to a pointer at the ADR/spec.

The two real-devpod checkboxes, the custom-host case, the outside-allowlist
case, and the real `SUPER+U` keybind itself were all run on the host and
passed: routing off left a stopped workspace stopped with one local window;
routing on connected window one to `devcontainer.devpod`, then to a
configured custom host, then correctly fell back to the default once that
file was removed; a path outside the allowlist stayed local-only even with
routing on. All six checkboxes closed.
