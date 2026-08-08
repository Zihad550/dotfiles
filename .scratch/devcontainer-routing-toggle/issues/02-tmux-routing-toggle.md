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

- [ ] With the enabled flag absent, running the script with stubbed
      `ssh`/`tmux` never invokes `ssh` at all — only the local window is
      created
- [ ] With the flag present, path under the allowlist, no custom host: the
      stubbed `ssh` is invoked targeting `devcontainer.devpod`
- [ ] With the flag present, path under the allowlist, custom host set: the
      stubbed `ssh` is invoked targeting the custom host instead
- [ ] With the flag present, path outside the allowlist: the stubbed `ssh`
      is never invoked — local window only
- [ ] Real devpod verification: routing off leaves a stopped workspace
      stopped (no auto-start triggered)
- [ ] Real devpod verification: routing on connects the SSH window to the
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
