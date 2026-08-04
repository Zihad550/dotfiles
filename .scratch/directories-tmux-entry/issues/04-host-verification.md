# 04 — Host verification of the whole flow

**What to build:** The handoff ticket: prove the feature from the user's
chair, in the running Launcher on the host. The container has no Wayland
session, no compositor and no `quickshell` binary, so none of these boxes
can be ticked by an agent — per the repo's handoff convention, each check is
one copy-pasteable block with what a pass looks like, run by the user, with
results appended under `## Comments`.

**Blocked by:** 02 — Tmux Entry in the Chooser, pure half; 03 — The session
script.

**Status:** ready-for-agent

## Manual verification

Each step is run on the host. A pass means the stated output, nothing less.

1. **Open the Launcher, route to directories, choose Tmux.**
   `qs -c launcher log` open in a terminal; press `SUPER+SPACE`, type
   `/`, pick a mirrored directory (e.g. `~/dev/...`), press `Shift+Return`
   and choose `Tmux`.
   *Pass:* a ghostty window appears running tmux; window one shows a shell
   on `devcontainer.devpod` whose prompt is inside the same absolute path;
   window two shows a shell in the local directory; the Launcher closed.
2. **Re-choose the same directory.**
   Repeat step 1 for the same directory.
   *Pass:* attaches to the existing session — no second session in
   `tmux ls`, no extra window spawned, no error.
3. **The `~` entry.**
   In step 1 choose the `~` entry (session `home`).
   *Pass:* session named `home` appears in `tmux ls`; window one is the
   container's home, window two the local home.
4. **A hostile path.**
   Create a directory whose name contains a space and a quote (e.g.
   `~/dev/it's "fine"`), refresh the directory cache, and choose Tmux on it.
   *Pass:* the session opens with both windows in that directory — no
   splitting, no failed window.
5. **Non-mirrored directory.**
   Choose a directory under `$HOME` that the devcontainer does not bind-mount
   (e.g. `~/Downloads`).
   *Pass:* window one lands in whatever the container has at that path (it
   may be empty of your files — the window still opens and the shell runs).
6. **Devcontainer down.**
   Stop the devcontainer (`devpod stop devcontainer`), then choose Tmux on a
   mirrored directory.
   *Pass:* the session opens; window one **either** connects after the ssh
   auto-start boots the devpod **or** shows the ssh failure inside the window
   — both are acceptable, per ticket 03's superseded note; window two is a
   working local shell; the session survives.

- [x] Steps 1–6 all pass on the host, results appended under `## Comments`

## Comments

**Handoff, 2026-08-04.** The agent's half is done — every code-level
prerequisite is verified from the container, the steps below are for the host
terminal.

Verified (in the devcontainer, since it has no Wayland session, compositor or
`quickshell` to tick the boxes itself):

- Ticket 02 landed: `chooserApps`/`chooserEntriesFor` in
  `quickshell/.config/quickshell/launcher/lib/directories.js` offer Tmux for
  every directory (no mirror condition), argv is `ghostty -e
  <abs script path> <session name> <path>`, path passed raw
  (direct:-exec semantics); `Directories.qml` calls `chooserEntriesFor` and
  `refreshCommand`. Node suite green: 25/25 directories tests, full launcher
  suite 384/384.
- Ticket 03 landed: `bin/df-tmux-session` exists, is executable
  (`-rwxrwxr-x`), and passes `bash -n`. State machine matches the grilling
  prototype; single-quote-doubling applied twice for the remote `cd`.
- Host prerequisites (checked on the host before starting): `tmux`, `ghostty`,
  `devpod` (auto-starts on ssh per scd), and `qs` / a running Launcher
  (`ps` shows a quickshell process). Confirm `df-tmux-session` is stowed on
  the host (the repo's bin/ is at `~/dotfiles/bin`).

Two notes for the user running the steps:

- Step 4's "refresh the directory cache" — the cache only rebuilds when it is
  older than `STALE_SECONDS` (300s) or missing. To force a rebuild before the
  hostile path shows up:
  ```
  rm ~/.cache/df-dir-picker/folders.list
  ```
- Step 6's pass text was edited above: ticket 03 superseded the "ssh failure"
  expectation — `ssh devcontainer.devpod` auto-starts a stopped devpod, so
  window one may connect after a boot delay instead. The session and its
  second window survive either way.

Each step below is one copy-pasteable block; append results here as you go.

<!-- User: append per-step results below this line. -->

**Bug found on step 1 and fixed, 2026-08-04.** Choosing Tmux on *any*
directory under the mirrored `~/.agents` root (or any dotted dir under
`/dev`/`dotfiles`) failed with tmux's

```
can't specify pane here
```

Root cause: the session-name slug replaced `/` with `-` but left `.` and
`:` intact, and those are **target separators in tmux's own grammar** — a
`-t` name containing one parses as `window.pane`. `~/.agents` named its
session `.agents`; `tmux new-window -t .agents` hit the pane-component
check (`cmd-find.c:1153`) and died, so the script never spawned window two
or attached. Fixed in `sessionNameOf` (lib/directories.js), TDD-first: the
slug now also replaces `.` and `:` with `_` (`.` with `_` stays "leading"
free — `.agents` → `_agents`). 26/26 directories tests, 385/385 launcher
suite. The fix changes `tmux ls` output for those directories: session
`_agents-notes` rather than `.agents-notes`. Step 1 should be re-run on the
same directory that failed.

**Verified on the host, 2026-08-04.** All six steps pass, including the
previously failing dotted directories after the fix — the box above is ticked.
