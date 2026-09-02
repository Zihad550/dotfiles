# SUPER+U follows Devcontainer Routing instead of forcing local

`SUPER+U` was the only consumer of Devcontainer Routing that opted out of it.
`bin/df-herdr-session` carried a `--local` flag that skipped the toggle and the
Mirrored Directory check entirely, and `apps.lua`'s binding was its sole caller;
the Launcher's Herdr, Zed, VSCode, Cursor and Neovim entries all routed.

The flag is deleted and the binding stops passing it. `SUPER+U` now resolves
routing the way every other call site does — routed when Devcontainer Routing
is on **and** the path is a Mirrored Directory. `~/dotfiles` is in the
allowlist, so routing-on opens `herdr --remote <host> --session herdr` against
whatever host Quick Settings configured. This supersedes
`docs/adr/0003-tmux-to-herdr.md`'s "SUPER+U forces local (`--local`)".

## Why

**The surprise ADR 0003 guarded against was the smaller one.** That ADR argued
a "just give me a terminal" keybind should not silently become an SSH session
because routing happened to be on elsewhere. In practice the reverse bites:
with routing on, `SUPER+U` is the one place work *isn't* happening, and the
toggle's central promise, "on" means one consistent thing everywhere, recorded
in GitHub issue #7, is broken by its
most-pressed keybind. One mental model, one state, everywhere is the same
argument ADR 0002 used to reject per-tool switches; `--local` was a per-tool
switch wearing a flag.

**One window identity, not two.** The considered alternative was a second
dotted class (`io.github.zihad550.dotfiles.herdr.remote`) on its own Special
Workspace, so `SUPER+U` would always land on the window matching the current
toggle and both could coexist. Rejected: two scratch terminals is not what the
keybind means, and the identity would then encode a mode the window itself
can't display. The cost is real and stated below.

**Mismatched windows are focused, not replaced.** `df-launch-special-workspace`
resolves an existing client by `initialClass` and exits *before*
`df-herdr-session` ever runs, so with one identity a local and a routed window
are indistinguishable to it. The alternatives — having `SUPER+U` kill a
mismatched window, or having the Quick Settings toggle close any herdr window
when flipped — both make an ordinary action destroy a live terminal and
whatever is running in it. A focus keybind that can end a session is a worse
surprise than any this ADR is fixing.

**Fail loudly, no pre-flight probe.** An unreachable host could be detected
with `ssh -o BatchMode=yes -o ConnectTimeout=...` before choosing a branch, and
fall back to local. Rejected on both counts: it puts a synchronous network wait
in front of a keybind that must feel instant, and silently landing in a local
session when the user asked for the devcontainer is exactly the class of
surprise this ADR otherwise argues against.

**No remote working directory.** `herdr --remote <ssh-target> [--session
<name>]` takes no path (verified against `herdr --help`), so the routed session
opens wherever the remote server's session already sits, not `~/dotfiles`. This
is the same gap ADR 0003 recorded for the Launcher's Herdr entries, carried
forward rather than worked around — every workaround is either remote-side
config outside this repo or post-attach keystroke injection.

## Consequences

- With a herdr window already open, `SUPER+U` focuses it whatever the toggle
  says. Switching modes means closing the window first, then pressing
  `SUPER+U` again. This is a known limitation of the one-identity choice, not
  an oversight.
- A routed `SUPER+U` opens in the remote session's own directory, not
  `~/dotfiles`.
- An unreachable host surfaces as a *misleading* notification.
  `wait-after-command` is not set in `ghostty/.config/ghostty/config`, so
  ghostty's default applies and the window closes when `herdr --remote` exits.
  `df-launch-special-workspace`'s poll loop then never observes a new client
  and fires `notify_failure "Launch verification failed for initialClass ...
  (0 new exact clients)"` — blaming launch verification for what is an SSH
  failure. Loud, as intended, but not accurate about the cause. Ghostty's
  default was verified with `ghostty +show-config --default`.
- Worse, that notification is not guaranteed. `df-launch-special-workspace`
  polls every 0.1s and exits 0 the moment it sees the new client sitting on
  the Special Workspace, so a ghostty window that maps and *then* dies as
  `herdr --remote` fails can be observed, moved, and reported as a success --
  leaving no window and no notification at all. Whether the failure is loud
  or silent is a race, decided by where in the poll interval the ssh failure
  lands. Fixing it belongs to `df-launch-special-workspace`, which has no
  concept of a launched command failing after its window appears, and is not
  attempted here.
- `bin/df-herdr-session` has one path through its routing logic again; the
  `--local` flag, its handling and its comment block are gone.
- `tests/dotfiles/herdrSession.test.js` is new — the script's routing branches
  had no coverage at all before, having only ever been exercised by hand. It
  pins `HOME` as well as `PATH` to a fixture: `HOME` drives the
  `~/.local/bin/herdr` fallback, the state directory, *and* `is_mirrored`'s
  `$HOME/dotfiles` match, so `PATH` alone would let the real herdr on the host
  leak into the run.
- The routing-off behavior remains unchanged; only ADR 0003's `--local`
  paragraph is superseded.
