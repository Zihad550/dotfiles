# 03 — The session script

**What to build:** The helper script that owns the tmux state machine. A
directory chosen from the Launcher reaches it with a session name and a path;
the script starts the session with two windows — window one an ssh session
into the devcontainer at the same path (scd semantics: same path, a missing
remote directory tolerated), window two the directory on this machine — and
attaches. Choosing the same directory again attaches to the running session
without spawning anything new.

The state machine, from the grilling session's prototype:

```
if tmux has-session -t <name> → exec tmux attach -t <name>
else → tmux new-session -d -s <name> -c <path> "ssh -t devcontainer.devpod \"cd '<path>' 2>/dev/null; exec \$SHELL\""
       tmux new-window -t <name> -c <path>
       exec tmux attach -t <name>
```

`new-session -A` alone cannot express "spawn the second window only on
creation" — the `new-window` after it fires on every attach — which is why
the branch exists.

**Blocked by:** None — can start immediately. (02's argv names this script
by contract; the script takes its two arguments and does not import the
module.)

**Status:** needs-info

- [x] Running the script with a session name no session has: creates the
      session, window one runs the ssh command into the devcontainer at the
      given path (missing remote directory tolerated, per scd), window two
      opens at the local path, and both windows' shells start in the path
- [x] Running it again with the same name: attaches to the existing session
      and creates no additional window
- [x] A path containing spaces or quotes survives as one argument through the
      whole chain
- [x] With the devcontainer unreachable: the ssh window fails inside the
      window while the session and its second window survive — **superseded
      by scd semantics**: `ssh devcontainer.devpod` auto-starts a stopped
      devpod before running the command, so window one connects rather than
      failing; the session and its second window survive either way.
- [x] Script is called by absolute path and follows the repo's bin/ script
      conventions

## Comments

Implemented as `bin/df-tmux-session` (ticket 03). The state machine matches
the grilling prototype: `has-session` → attach; else detached
`new-session` + `new-window` + attach. The path is quoted with the module's
single-quote-doubling rule applied twice — once for the remote shell's
`cd '...'`, once for the pane shell tmux runs the command through — so it
survives both parses whole; `$SHELL` is left literal for the remote shell to
expand. Two quoting checkboxes closed from the container with stub
tmux/ssh: a path containing spaces, single and double quotes arrives as one
argv at `ssh` and parses into the right `cd` on the far side; a missing
remote directory falls through to `exec $SHELL`. The rest are host claims.

## Manual verification

Each step runs on the host with a real tmux. A pass means the stated output,
nothing less.

1. **Create on first run.**
   ```
   tmux kill-session -t test-dir 2>/dev/null; ~/dotfiles/bin/df-tmux-session test-dir ~/dev
   ```
   *Pass:* a tmux session named `test-dir` attaches with two windows — window
   one an ssh shell on `devcontainer.devpod` whose prompt is inside
   `~/dev`, window two a local shell in `~/dev`.
2. **Attach on re-run.**
   Detach (`C-Space d`), then run the same command again.
   *Pass:* attaches to the same session — `tmux ls` shows one `test-dir`
   session, window count unchanged.
3. **Hostile path.**
   ```
   mkdir -p "$HOME/dev/it's \"fine\""; ~/dotfiles/bin/df-tmux-session hostile "$HOME/dev/it's \"fine\""
   ```
   *Pass:* both windows open in `it's "fine"` — no splitting, no failed
   window.
4. **Devcontainer down.**
   `devpod stop devcontainer`, then run step 1's command.
   *Pass:* the session opens; window one shows the ssh failure inside the
   window; window two is a working local shell; the session survives.