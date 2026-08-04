# 24 — quickshell aborts in the Launcher's scope

**What to build:** Nothing yet. Establish whether quickshell 0.3.0-2 aborts in
the Launcher's systemd scope, and if it does, get a live reproduction worth
filing upstream.

**Status:** needs-triage — split out of 21 on 2026-08-03. All the evidence
below is forensic, from a boot that ended on 08-01; nothing reproduces it on
demand, and four separate theories about its cause have been disproved.

Split from **21 — One Launcher instance**, which was about stopping a second
`qs -c launcher` from quietly becoming a second Launcher. That work is done.
This was found alongside it and kept 21 open long after 21's own scope closed,
which is the reason for the split: it survived every theory that tied it to
duplicate instances.

- [ ] The abort reproduces on demand, or is confirmed gone across a week of
      normal use
- [ ] If it reproduces, it is filed upstream with a one-line reproduction
- [ ] If it does not, this ticket closes as not-reproducible with the evidence
      kept

## The evidence

Three coredumps, all on 2026-08-01, all `/usr/bin/quickshell`:

```
Sat 2026-08-01 10:13:19 +06 314918 1000 1000 SIGSEGV present /usr/bin/quickshell 8.1M
Sat 2026-08-01 12:55:35 +06 508544 1000 1000 SIGSEGV present /usr/bin/quickshell 7.1M
Sat 2026-08-01 13:17:16 +06 649642 1000 1000 SIGABRT present /usr/bin/quickshell 6.5M
```

Versions, unchanged throughout and still current on 08-03: **quickshell
0.3.0-2** (Arch, installed 2026-07-26), **qt6-base 6.11.1-1**.

Two signals, so plausibly **two different bugs**. The SIGABRT is the one with a
readable stack.

### The SIGABRT (pid 649642)

`coredumpctl info 649642`:

- `Signal: 6 (ABRT) si_code: SI_TKILL` — the process signalled *itself*. A
  deliberate `abort()`, not a memory fault.
- `Command Line: /usr/bin/quickshell` — **bare, no `-c`**. This does not match
  either autostart line, and it contradicts the live-instance observation from
  21 (`452658 /usr/bin/quickshell -c launcher -n -d`), where a daemonized
  instance kept its flags. Unexplained.
- `User Unit: app-Hyprland-quickshell-84b0ea54.scope`.

Stack, trimmed to the load-bearing frames:

```
#6  abort                       (libc.so.6 + 0x25685)
#7  n/a                         (libQt6Core.so.6 + 0x98d3a)
#8  _ZN6QDebugD1Ev              (libQt6Core.so.6 + 0x111d11)
#9  n/a                         (quickshell + 0xa077e)
#10 n/a                         (quickshell + 0xd227c)
#11 n/a                         (quickshell + 0xba271)
#12 n/a                         (libc.so.6 + 0x27781)
#13 __libc_start_main           (libc.so.6 + 0x278b9)
```

`QDebug::~QDebug()` → `abort` is the signature of **`qFatal()`**: Qt's fatal
handler aborts when the QDebug temporary destructs. Frames #9–#11 sit directly
between `__libc_start_main` and that destructor, so it is inside `main`'s call
chain — not QML destruction, and not inside the event loop.

### Scope attribution

The scope hash resolves to the Launcher:

```
Aug 01 12:53:48 uwsm_app-daemon[3727]: sent: exec systemd-run --user --scope \
  --slice=app-graphical.slice --unit=app-Hyprland-quickshell-84b0ea54.scope \
  --description=quickshell --quiet --collect --same-dir -- quickshell -c launcher -n -d
Aug 01 22:57:55 systemd[3306]: app-Hyprland-quickshell-84b0ea54.scope: Consumed 39.644s CPU
  time over 3h 42min 2.953s wall clock time, 389.4M memory peak.
```

So it is `-c launcher`, not `-c dotfiles`. But note the timing: the scope
started at **12:53:48** and lived until **22:57:55**, while the dump is at
**13:17:15** — *inside* the scope's lifetime. The scope survived the abort by
over nine hours. Whatever aborted was a short-lived process in the Launcher's
scope, with bare argv, that died while the real instance kept running.

That is the fact every theory so far has failed to accommodate.

## Theories disproved

1. **A multi-instance socket artefact** — that the first instance to exit tore
   down a shared IPC socket and a later one's cleanup `qFatal`'d on finding it
   gone. Disproved 08-01: block 4 of ticket 21 produced a new dump at kill time
   with exactly one instance running.
2. **Single-instance teardown** — that quickshell's own shutdown aborts.
   Doesn't fit: the scope outlived the dump by nine hours, so the process that
   aborted was not the instance tearing down.
3. **The `-n` refusal path calling `qFatal`** — that the "already running"
   message is emitted fatally. Disproved 08-03, both ways: `qs -c launcher`
   (undaemonized) and `quickshell -c launcher -n -d` (daemonized, the path
   autostart and `df-qs-restart` actually use) each printed the refusal
   cleanly with no new dump.
4. **Anything caused by ticket 21's changes** — the `-n` wiring, the `bin/qs`
   shim, `df-qs-restart`'s guard. The 10:13:19 dump predates the wiring, and
   08-03 ran four kills plus both refusal paths under the new code with zero
   dumps.

## Not reproducible on 2026-08-03

Across four launcher kills (two `df-qs-restart`, one `df-qs-test`, one
explicit `qs -c launcher kill`), an undaemonized refusal and a daemonized
refusal, `coredumpctl list quickshell` still ends at the 08-01 SIGABRT. Same
quickshell, same Qt.

## Next step

Stop reconstructing from a dead boot — catch the next one live. Worth doing:

- After any session oddity, `coredumpctl list quickshell | tail -3` before
  anything else. A dump caught in the current boot can be tied to its config
  by scope hash *and* still have its journal context intact.
- If one appears, `coredumpctl debug` with `quickshell-debug` (if Arch ships
  it) turns frames #9–#11 into names, which is what an upstream report needs.
  Without symbols the report is three offsets and a guess.
- If a week of normal use produces none, close as not-reproducible. Filing
  upstream against an unreproducible two-day-old dump with unresolved argv
  would likely be closed as needs-repro anyway.

## Comments
