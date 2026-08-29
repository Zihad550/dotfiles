# Lock state is a runtime file, and each lock signal has one job

`bin/df-power` learns whether the session is locked by reading a state file the
Session Lock writes, replacing the `pidof` probe ADR 0015 chose. Two other lock
signals exist alongside it, and each is assigned exactly one job: the
compositor's report that a monitor is blocked by a lock detects a Stranded Lock
and nothing else, and logind's locked hint is set for outside consumers and read
by nothing in this repo.

This supersedes ADR 0015's choice of lock-state signal only. Everything else
0015 decided — that the power keybinds stay reachable while locked and run
unconfirmed there, and why logout is excluded — is unchanged and still current.

## Why

**0015's reasoning was about hyprlock specifically, and hyprlock is gone.** It
rejected logind's locked hint because the locker of the day did not set it. Once
we own the locker, the question stops being "which existing signal do we trust"
and becomes "what contract do we publish".

**A file, not IPC.** The lock is a running process with an IPC surface, so
asking it directly is the obvious move. But `df-power` runs from a keybind at
the lock screen, where — per 0015 — nothing can render feedback. A blocked or
slow IPC call there is a shutdown keybind that silently does nothing, which is
the exact failure 0015 exists to prevent. The established gotcha that a call to
a missing IPC target exits zero makes it worse: the wrong answer is
indistinguishable from the right one. IPC carries commands; the file carries
state.

**Three signals need three jobs, written down.** Any two of them can disagree
legitimately — a Stranded Lock is precisely the case where the compositor says
locked and no client agrees. Left undocumented, they will be used
interchangeably and produce a bug nobody can reason about.

## Consequences

The lock must write the file on every transition, including abnormal exit, or
`df-power` reads a stale answer. That is the cost of choosing a signal the lock
has to maintain over one derived from its existence, and it is the thing to
suspect first if the power keybinds ever misbehave.

> `docs/session-lock-break-glass.md` covers the case where the lock is broken
> rather than merely misreported, including the separate faillock tally this
> decision keeps apart from sudo's.
