# 21 — One Launcher instance

**What to build:** A second `qs -c launcher` should not be able to quietly become a second Launcher.

**Blocked by:** 02 — Second Quickshell config.

**Status:** needs-info — implementation complete and verified on the host,
except for one runtime check the reporter still has to run: the keybind half
of checkbox 2, a one-minute press-the-key test. See **Manual verification**
block 2. Everything else is closed.

The abort that kept this ticket open through 08-01 and 08-03 moved to
**24 — quickshell aborts in the Launcher's scope** on 2026-08-03. It was never
about single-instance enforcement: it survived every theory that tied it to
duplicate instances, and the scope evidence eventually showed the aborting
process outliving nothing and the real instance running on for nine hours
after it. Keeping it here was holding a finished ticket open.

Nothing stops two instances of the launcher config running at once, and two
instances are not twice one Launcher — they are a split brain:

- Both register the same `GlobalShortcut { appid: "launcher"; name: "toggle" }`
  (`shell.qml:42-44`, and `name: "clipboard"` at `:56-58`). One keypress toggles
  both, and if they were started at different moments they are out of phase, so
  the window appears to need two presses to close.
- `qs -c launcher ipc call theme reload` reaches one of them. `df-theme-set`
  (`bin/df-theme-set:138`) therefore restyles one Launcher and leaves the
  other on the old theme.

Found by running `qs -c launcher` in a terminal to read the logs while
`autostart.lua:13` already had one running — which is a thing anybody debugging
this config will do, and it gives no indication that it is the cause.

- [x] Starting a second `qs -c launcher` while one is running does not leave two running
- [ ] Whichever instance survives, the toggle keybind and the theme-reload IPC both reach it
- [x] The second invocation says why it exited, rather than exiting silently
- [x] Reading the running instance's logs does not require starting a second one, and how to do it is written down

All four are runtime checks, closed by the host's output in **Manual
verification**. Block 1 closes checkboxes 1 and 3, block 3 closes checkbox 4.
Checkbox 2 is half-closed — block 2's IPC ran on 08-01 and again on 08-03, its
keybind half has never been run, and per `docs/agents/issue-tracker.md` a
runtime checkbox is never ticked from inspection.

A fifth checkbox ("Killing a Launcher does not abort") lived here until
2026-08-03 and is now ticket 24's first checkbox.

## Implemented (2026-08-01)

Quickshell 0.3.0 already ships both halves of this fix; the config needed no
QML at all:

- `qs -c CONFIG -n` (`--no-duplicate`) — "Exit immediately if another instance
  of the given config is running." It prints `An instance of this
  configuration is already running.` to the invoking terminal and exits — the
  message survives even under `-d`, since the check runs in the daemon child
  before its stdio detaches.
- `qs -c CONFIG log` — reads the running instance's own `log.qslog` in its run
  directory, `-f` to follow, `-t N` to tail. No second instance needed.

Wiring, all in this repo:

- `autostart.lua:9,13` — both long-running configs start with `-n`, so an
  autostart firing twice cannot double either one (the "seen in the wild"
  session had four `-c dotfiles` against fifteen `-c launcher`).
- `bin/df-qs-restart` — the start line carries `-n` as a backstop behind its
  count check; the kill loop stays as the recovery path for sessions that
  accumulated several before the guard existed.
- `bin/qs` (new) — bin/ is first on PATH (`zsh/.zshenv:86`, which
  `bash/.bashrc:1` sources), so this shadows the system binary for interactive
  use and injects `-n` into any invocation that selects a config with
  `-c`/`--config`, passing through untouched: 0.3.0's full subcommand set
  (`log`, `list`, `kill`, `ipc`, `msg`), explicit `-n`/`--no-duplicate`, and
  anything that names no `-c` config (`qs -p file.qml`, `qs --help`, `qs -V`).
  That is the exact discovery scenario closed: `qs -c launcher` typed in a
  terminal while one is running now exits with the reason instead of becoming
  a second instance.

  `-p`/`--path` is left alone deliberately. It is quickshell's ad-hoc path
  (`qs -p ~/myshell/randomfile.qml`) and mutually exclusive with `-c`; the
  duplicate harm this ticket is about belongs to the two *named* long-running
  configs, whose keybinds and IPC targets are shared. A `-p` launch that wants
  the guard can spell `-n` out.
- `shell.qml` header — records the `qs -c launcher log` debugging path
  (checkbox 4's "written down").

With one instance guaranteed, the split-brain is gone by construction: the
`launcher:toggle` / `launcher:clipboard` keybinds register exactly once, and
`qs -c launcher ipc call theme reload` has exactly one instance to reach.
(With two instances, `qs log` and `qs ipc call` fail outright with "More than
one instance starts with..." — a third harm of the duplicate that the single
instance removes.)

## Seen in the wild, 2026-08-01

A session had accumulated roughly fifteen `-c launcher` instances against four
`-c dotfiles` over one boot (`journalctl --user -b | grep 'sent: exec.*quickshell -c'`
counts them). Three findings, the first already fixed:

**`df-qs-restart` could not recover from it, and made it worse.** `qs -c CONFIG
kill` kills exactly *one* instance; the script called it once and then waited
for `pgrep` to report nothing before starting the new one. With two or more
running, that wait could never clear, so it burned its full timeout and started
another on top. The script could hold the count or raise it, never lower it.
Fixed the same day: it now kills in a loop until nothing matches, waits for the
*count* to drop between kills rather than for zero, refuses to start if
instances will not exit, and says `Killed N instances` when N > 1. That is
damage control — nothing yet stops the second instance from starting, which is
this ticket.

**Killing a Launcher dumps core; killing the bar does not.** Moved to ticket
24 on 2026-08-03 with all three dumps, the `qFatal` stack, the scope
attribution and the four theories it disproved. It is not a duplicate-instance
problem, which is why it no longer lives here.

## Manual verification

An agent runs in a devcontainer with no Wayland session (docs/agents/issue-tracker.md),
so the four runtime checkboxes are closed by these blocks' output, run on the
host. One block per step; the expected output is given after each command.
Block 1 closes checkboxes 1 and 3, block 2 checkbox 2, block 3 checkbox 4.
Block 5 covers the `df-qs-restart` bug found below, which is not one of the
four. Block 4 left with checkbox 5 to ticket 24.

**Only block 2's keybind half is still outstanding.** Everything else in this
section has been run on the host, on 08-01 and again on 08-03.

### 1. A second start refuses; one instance survives

```bash
type qs                                        # expect: ~/dotfiles/bin/qs, not /usr/bin/qs
pgrep -cf '(quickshell|qs) -c launcher( |$)'   # expect: 1
qs -c launcher
pgrep -cf '(quickshell|qs) -c launcher( |$)'   # expect: still 1
```

Between the two pgrep calls, the bare `qs -c launcher` — the exact discovery
scenario — must print `An instance of this configuration is already running.`
and exit 0. It exits quickly, which is itself the point; the trap is assuming
no output on the second pgrep means it worked.

`type qs` leads because the whole scenario rests on the shim being what runs.
Spelling the flag out by hand (`quickshell -c launcher -n`) tests quickshell's
guard, not this repo's wiring, and leaves `bin/qs` unexercised.

### 2. Keybind and theme-reload IPC reach the survivor

```bash
qs -c launcher ipc show              # expect: a `launcher` and a `theme` target
qs -c launcher ipc call theme reload # expect: no error, exit 0
df-qs-restart launcher               # then press the launcher:toggle keybind,
                                     # then the launcher:clipboard keybind
```

Both halves are required. One press of each keybind after a restart must open
the Launcher — on the clipboard bind, opened on `$` — and a second press must
close it. Needing two presses is the split-brain symptom this ticket exists to
remove, so a single press doing nothing visible is a failure, not a slow start.

### 3. Logs are read without starting a second instance

```bash
qs -c launcher log | tail -3   # expect: this instance's own log lines
```

### 4. Killing a Launcher does not abort

Moved to ticket 24 with the rest of the coredump evidence. Block numbering is
left as-is so the 08-01 and 08-03 verification logs below still line up.

### 5. A refused start is reported, not silent

```bash
df-qs-restart launcher    # expect: "Starting quickshell -c launcher", exit 0
echo $?
pgrep -cf '(quickshell|qs) -c launcher( |$)'   # expect: 1
```

Then the failure path, which is what the fix is for — with one already
running, the script's own kill loop should clear it, so force the refusal by
starting a second config start by hand while the first is still dying:

```bash
qs -c launcher kill && df-qs-restart launcher
echo $?    # expect: 0 with one instance, or 1 with the "expected 1 instance
           # of 'launcher' after starting, found 0" message -- never 0 with
           # nothing running
```

The bug was that a `-n` refusal exits 0, so the script reported a start it had
not made. Exit 0 with a zero pgrep count is the regression.

## Host verification, 2026-08-01

Blocks 1–3 passed. One new bug found in `df-qs-restart`, fixed below.

**Block 1** (refusal; survivor): before the attempt, one instance was running —
`pgrep -af '(quickshell|qs) -c launcher'` → `452658 /usr/bin/quickshell -c
launcher -n -d`. The bare `quickshell -c launcher -n` printed `An instance of
this configuration is already running.` — the guard's message, the discovery
scenario closed. Checkboxes 1 and 3 closed.

Caveat on how it was run: the flag was spelled out on `quickshell` rather than
left to `bin/qs`, so what this proved is quickshell's guard, not the shim that
carries it into a bare `qs -c launcher`. Block 1 now leads with `type qs` for
that reason; the shim's own injection is still unexercised on the host.

**Block 2** (IPC): `qs -c launcher ipc show` → `target theme` (`reload(): void`)
and `target launcher` (`dismiss(): void`); `qs -c launcher ipc call theme
reload` → no error. The IPC half of checkbox 2 closed; the keybind half (one
keypress: launcher:toggle then launcher:clipboard after a `df-qs-restart
launcher`) is a one-minute host check still pending, so checkbox 2 is unticked
rather than closed.

**Block 3** (logs): `qs -c launcher log | tail -3` → the running instance's own
log lines (clipboard 89 entries, processes 488, screenshots 732). Checkbox 4
closed.

**Block 4** (kill): produced a new dump at kill time with exactly one instance
running, which disproved the multi-instance-socket theory this block was
written to test. Full write-up in ticket 24.

**New bug found: `df-qs-restart` start can be silently refused.** quickshell's
`-n` refusal exits 0, so the script could not tell a refused start from a good
one. On the host, `df-qs-restart launcher` right after the block-4 kill printed
`Starting quickshell -c launcher` and then the refusal message — a dying
instance's lock outlives the kill while the coredump is written, so the new
start refused, exited 0, and left nothing running (the session's UI error is
the only trace). Fixed the same day: the script now verifies the instance
actually came up — pgrep must reach exactly 1 within 5s after starting
(tolerating the transient 2 while the daemonize parent exits) — and exits 1
with a message instead of a silent no-op. Pending a host rerun — block 5 of
**Manual verification**.

## Host verification, 2026-08-03

Re-run on the host after the review follow-ups below. Blocks 1–3 pass, this
time through `bin/qs` rather than around it.

**Block 1** (refusal via the shim): `type qs` → `/home/jehad/dotfiles/bin/qs`,
so the shim is what ran. `qs -c launcher` printed `An instance of this
configuration is already running.` — the 08-01 caveat is now closed: the
injection itself is exercised, not just quickshell's guard. `qs --help` and
`qs -V` rendered normally, confirming no `-n` leaks into non-config
invocations. Checkboxes 1 and 3 closed.

**Block 2** (IPC): `qs -c launcher ipc show` → `target launcher`
(`dismiss(): void`) and `target theme` (`reload(): void`). Keybind half still
not run, so checkbox 2 stays open.

**Block 3** (logs): `qs -c launcher log` printed the running instance's own
log, and `qs -c launcher log` was passed through without `-n` — the subcommand
case works against the real binary. Checkbox 4 closed.

**Block 5, first half** (`df-qs-restart` reports a real start): `df-qs-restart
launcher` → `Starting quickshell -c launcher`, exit 0, and `pgrep -cf` → 1.
The post-start count check passes. `df-qs-restart launcher --log` restarted
cleanly — instance `zcc6nwa7jt` appears under the next run's `Dead instances`
and `zzd6fxa7jt` replaced it — with all Providers healthy (17 themes, active
`kanagawa`; 257 clipboard entries; 733 screenshots). `df-qs-test test` also
came up.

**Block 5, second half** (a refused start is reported): did not reproduce.
`qs -c launcher kill && df-qs-restart launcher` killed `zzd6fxa7jt` and
started `6wl6p1b7jt` cleanly — exit 0, `pgrep -cf` → 1. That is the good path,
not the failure path, and the failure path may not be reachable by hand: the
refusal happened originally because a dying instance's lock outlived the kill
*while its coredump was being written*. This kill was clean, so there was no
lock left to refuse against.

That makes block 5's second half gated on ticket 24's abort rather than
independent: no abort, no coredump being written, no lock outliving the kill,
nothing to refuse against. Accepted as a guard verified by inspection — it
costs nothing when the start succeeds, which is every run so far, and its
failure branch is one `echo` and an `exit 1`.

**Block 4** (kill does not abort): no new coredump across four launcher kills
on 08-03, and the follow-up investigation — `coredumpctl info` on the SIGABRT,
the scope-hash lookup that tied it to `-c launcher`, the Qt/quickshell version
checks, and the two refusal-path tests — all moved to ticket 24 on 2026-08-03.
The short version for this ticket's purposes: none of it turned out to be
about duplicate instances, which is why it left.

### Also verified 2026-08-03

`luac -p hypr/.config/hypr/lua/autostart.lua` — clean. The comment trims there
did not break the file, which is the one edit in this round that could have
failed at session start rather than at call time.

One note for whoever reads this next: a `-d` start still prints its startup
log to the terminal through `Configuration Loaded` before detaching. Deliberate,
not a symptom.

## Review follow-ups (2026-08-03)

From a standards/spec review of the four wired files. All applied:

- `bin/qs` injected `-n` into every invocation that was not a subcommand,
  including ones with no config at all (`qs -p file.qml`, `qs --help`) and
  `bin/df-qs-test`'s `qs -c "$CONFIG"` for scratch configs. It now injects only
  when `-c`/`--config` selects a config, which is what **Implemented** always
  claimed it did.
- `bin/qs` gained a missing-binary check in the repo's `Error:` style; without
  it a missing quickshell surfaced as bash's own `command not found`.
- `bin/df-qs-restart` checked `command -v qs` but then invoked `quickshell`
  directly — it validated the wrong binary. Now checks `quickshell`.
- `bin/df-qs-test`'s pgrep pattern had drifted from `df-qs-restart`'s: it was
  missing the `( |\$)` word-end anchor, so a scratch config named `test` also
  matched `test-probe`. Realigned. Its `kill` also redirected only stderr, so
  `No running instances for ...` leaked to the terminal on every run.
- `bin/qs`'s subcommand comment justified excluding a `run` subcommand. 0.3.0
  has no `run` — its full set is `log`, `list`, `kill`, `ipc`, `msg`, per
  `quickshell --help` on the host. Comment corrected; no behaviour change.
- Comment volume in all four files was cut against CLAUDE.md's "only write code
  comments when it's hard to understand by reading code" — the single-instance
  rationale had been restated in full in four places.
- The `wl-paste --watch cliphist store` lines in `autostart.lua` are ticket
  14's, not this one's. Left in place because removing them would break the
  clipboard Provider; noted here so 14 can claim them.

## Comments
