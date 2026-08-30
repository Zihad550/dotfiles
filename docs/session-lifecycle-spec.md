## Problem Statement

Locking and idling are handled by two Hyprland-native daemons that sit outside
every mechanism this repo otherwise uses to configure itself, and the cost shows
up in four places.

**The Session Lock is themed through a parallel pipeline nothing else uses.**
Every theme carries a generated lock config produced from its own template,
holding five colour variables and nothing else. The font switcher patches two
occurrences of a font name inside those generated files with a positional
substitution — a mechanism that exists solely because the lock cannot read the
theme data every other Quickshell surface already reads.

**The Idle Ladder is configuration in a foreign format, and varying it needs a
systemd drop-in.** The devbox needs the same ladder without its Suspend Stage.
Achieving that today takes a second complete copy of the idle config plus a
shared setup script that rewrites the daemon's unit to point at it. Three
mechanisms — a duplicated config, a drop-in, and a wrapper script documented in
four places — deliver one difference: one Stage removed.

**Nothing can be built on top of either.** There is no Stay Awake toggle,
because the idle daemon has no interface to inhibit it from. Quick Settings has
a Tile grid ready for one and cannot offer it.

**Lock state is inferred rather than reported.** `df-power` must know whether
the session is locked, and the only available signal is the presence of a
process — chosen deliberately over logind's hint, which the current locker does
not set (ADR 0015). Nothing distinguishes a lock that has been requested from
one that is Secure, so nothing can wait for the latter.

Separately, the Greeter is a second, unrelated question that has been repeatedly
conflated with the first: it authenticates before a session exists and cannot
lock one. It is included here only to settle that boundary and to record that
its own replacement is independent.

## Solution

The Session Lock and the Idle Ladder become Quickshell QML, in a Quickshell
config of their own, drawing their colours from the same per-theme data the Bar
and Launcher already read and their timings from a single configuration file.
The devbox supplies a one-field override for that data rather than another
complete timing file.

The lock becomes a first-class participant in the session rather than a process
spawned at it. It reports whether it is Secure, holds its own sleep inhibitor so
suspend waits for that, and exposes locking as a command to a running process.
Its edge-case handling is imported wholesale from Omarchy, whose equivalent
plugins encode years of accumulated fixes for stranded locks, multi-monitor
transitions and lid-close races.

The lid switch has a separate Clamshell Mode path. With an external display
active, closing the lid moves normal workspaces off the internal output before
disabling it and leaves the session awake; opening the lid restores the saved
monitor layout and the workspaces moved by that transition. Without an external
display, closing the lid starts the Session Lock and leaves suspend to logind.

Separately and afterwards, the Greeter moves from GDM to SDDM, matching
Omarchy's choice, and the greeter-specific power-policy workaround that only
made sense for a GNOME greeter is deleted rather than translated.

## User Stories

1. As someone who switches themes, I want the Session Lock to follow the active
   theme, so that locking does not reveal the previous theme's colours.
2. As someone who switches themes, I want no per-theme lock file to be generated,
   so that adding a theme means adding theme data and nothing else.
3. As someone who changes the monospace font, I want the Session Lock to follow
   it without a positional text substitution, so that renaming or reformatting
   the lock's layout cannot silently break the font switcher.
4. As the maintainer, I want one fewer theme template, so that the set of things
   a theme must provide shrinks.
5. As someone at a locked machine, I want the Session Lock to accept my password,
   so that I can return to my session.
6. As someone at a locked machine, I want a wrong password to tell me it was
   wrong, so that I can distinguish a typo from a broken lock.
7. As someone at a locked machine, I want repeated wrong passwords to lock out on
   the lock's own policy rather than the policy that governs sudo, so that
   fat-fingering my password at the lock screen does not degrade my shell.
8. As someone with more than one monitor, I want every screen covered when the
   session locks, so that no screen is left showing my work.
9. As someone plugging in or unplugging a monitor while locked, I want the newly
   attached screen covered too, so that a display change is not an unlock.
10. As someone whose screens are all off or detached at the moment a lock is
    requested, I want the lock to be held until a screen exists, so that the
    request is not silently dropped.
11. As someone whose lock client has died, I want the compositor's stranded lock
    to be detected and recovered, so that I am not left at an unresponsive screen
    with a working password.
12. As someone who closes the lid, I want the session locked before the machine
    suspends, so that opening it elsewhere does not expose my session.
13. As someone who closes the lid, I want the machine to wait for the lock to
    become Secure rather than merely requested, so that "locked before suspend"
    is a fact and not a race.
14. As someone who closes the lid, I want that wait to be bounded, so that a
    broken lock delays suspend by seconds rather than stranding a closed laptop
    in a bag.
15. As someone whose lock failed to secure before suspend, I want to be told on
    the screen I unlock into, so that I know the session was exposed.
16. As someone at the keyboard, I want the screen to dim before anything more
    drastic happens, so that I get a warning I can cancel by moving.
17. As someone who moves the mouse after the screen dims, I want the previous
    brightness restored exactly, so that idling and returning is invisible.
18. As someone who idles long enough, I want the session locked, so that walking
    away protects it without my remembering to.
19. As someone who idles past the lock, I want the screens blanked, so that a
    locked machine is not burning a panel overnight.
20. As someone who idles past blanking, I want the machine suspended, so that it
    is not drawing power all night.
21. As someone giving a presentation, I want a Stay Awake toggle, so that the
    Idle Ladder does not dim or lock mid-sentence.
22. As someone using Stay Awake, I want manual locking and manual suspend to keep
    working, so that the toggle suppresses idling only.
23. As someone using Stay Awake, I want to see that it is on, so that I do not
    leave a machine that will never lock.
24. As someone playing a video, I want an application's own idle inhibition
    respected, so that I do not have to reach for the toggle.
25. As someone using the devbox, I want the Idle Ladder without its Suspend
    Stage, so that a machine I reach over the network stays reachable.
26. As the maintainer, I want the devbox's difference expressed as configuration
    rather than as a systemd drop-in over a duplicated config, so that one
    changed number is one changed number.
27. As the maintainer, I want the ladder's timings in one file per box, so that
    tuning a timeout does not mean reading a daemon's config syntax.
28. As someone pressing the power keybind at a locked screen, I want it to work
    as it does today, so that ADR 0015's behaviour survives the change.
29. As someone pressing the power keybind at a locked screen, I want the lock
    check to never block, so that a wedged shell cannot leave the keybind
    silently dead.
30. As someone using the Launcher's power menu, I want the Lock entry to work,
    so that the change is invisible from the menu.
31. As someone using Quick Settings, I want its Lock action to work, so that the
    change is invisible from the panel.
32. As someone using the lock keybind, I want it to work, so that the change is
    invisible from the keyboard.
33. As the maintainer, I want the lock's appearance developed against a surface
    that does not take a real session lock, so that iterating on it cannot lock
    me out of my own machine.
34. As the maintainer, I want the lock and idle decision logic testable without a
    compositor, so that stage transitions and lock states are covered by ordinary
    tests.
35. As the maintainer, I want the Session Lock isolated from the Bar and the
    Launcher, so that restarting the shell or crashing a Bar module cannot drop a
    live lock.
36. As the maintainer, I want the imported Omarchy logic attributed to the
    upstream file and revision it came from, so that a future reader knows it is
    a deliberate port and where to compare.
37. As someone whose lock breaks, I want a written recovery runbook, so that I am
    not deriving `pacman` invocations from a TTY at 2am.
38. As someone whose lock breaks, I want the runbook's commands verified before I
    need them, so that the Break-glass path is not itself untested.
39. As the maintainer, I want a Greeter that matches the rest of the desktop's
    provenance, so that the login surface is a considered choice rather than a
    leftover.
40. As the maintainer, I want the Greeter's replacement kept separate from the
    lock work, so that a boot-path change is revertible on its own.
41. As the maintainer, I want the suspend model documented as three paths rather
    than four once the GNOME greeter policy is gone, so that the documentation
    matches the mechanisms that exist.
42. As a future reader, I want the parts of Omarchy deliberately not imported
    recorded as such, so that finding them upstream does not read as an
    oversight.

## Implementation Decisions

**A third Quickshell config owns both the Session Lock and the Idle Ladder.**
It runs as its own instance alongside the existing Bar and Launcher configs,
autostarted the same way. Isolation is the point: the shell restart script
exists to be used, and a QML fault in a Bar module must not be able to drop a
live lock. Idle lives with the lock rather than in the Bar because its only job
is to drive the lock, and splitting them would require IPC between two processes
under the same ownership.

**The lock is a real session-lock client, not an overlay window.** It takes the
compositor's session lock protocol and renders one lock surface per screen,
authenticating through PAM.

**PAM gets a dedicated service for the lock.** Its lockout policy is separate
from the one governing sudo, and the existing sudo-tries setup narrows to sudo
alone. Password only — there is no fingerprint hardware on any box this repo
configures, so the upstream's optional fingerprint flow is not ported.

**Three lock-state signals exist, each with exactly one documented job.** A
runtime state file answers "is the lock up" for shell callers. The compositor's
report that a monitor is blocked by a lock detects a Stranded Lock, and nothing
else. Logind's locked hint is set for the benefit of outside consumers and is
not read by anything in this repo. Interchanging them is the failure mode this
decision exists to prevent; see ADR 0017.

**The lock holds its own sleep inhibitor.** It takes a logind delay inhibitor,
locks when logind announces sleep, and releases the inhibitor once it is Secure.
This diverges from the upstream, which bridges an external watcher to its shell
over IPC with a time budget; that machinery exists to span two processes, and
here they are one. The logind inhibit-delay window is still raised from its
default, because a delay inhibitor is a timer rather than a promise: logind
suspends when the window expires whether the session is Secure or not. See ADR
0016.

**Locking stays argv-shaped at every call site.** The Launcher's power actions,
the Launcher's system menu and Quick Settings' lock action continue to hold a
command vector; only its contents change, from spawning a locker to calling the
lock config's IPC target. The Launcher's menu and confirmation models are
untouched. This also resolves a documented wart: the power actions had no
scoping field because the lock alone would have wanted one, and it wanted one
only because it spawned a long-lived process.

**The lock's IPC target is a command surface, never a state surface.** Callers
that need state read the state file. The established gotcha that a call to a
missing IPC target exits zero makes IPC unsafe for questions whose wrong answer
is silent.

**The Idle Ladder's Stages are Dim, Lock, Blank and Suspend**, driven by the
compositor's idle-notification protocol with application inhibitors respected.
Dim shells out to the same brightness tool the current daemon uses rather than
routing through the Bar's backlight service, which lives in another process and
would fire an on-screen display as the screen dims. This leaves the Bar's cached
brightness stale across a dim-and-restore, so it is refreshed on unlock.

**Ladder timings are a data file the config reads, with small per-box
overrides.** The shared file supplies Dim, Lock, Blank and Suspend. The devbox
ships only `{ "suspend": null }`, so it keeps Dim, Lock and Blank while omitting
idle-triggered suspend. Manual suspend remains a separate system action. The
duplicated daemon config, systemd drop-in and wrapper script that produced that
difference are all removed.

**Stay Awake is a persisted toggle surfaced in Quick Settings**, suppressing the
Idle Ladder only. Manual locking and manual suspend are unaffected.

**Edge-case handling is imported from Omarchy exhaustively; its architecture is
not.** Every guard, deferral and recovery path its lock and idle plugins encode
is carried over — deferring a lock until a real screen exists, recovering a
Stranded Lock, unwinding the ladder on activity. Its plugin loader, manifest
system, service-injection pattern and external sleep-lock scripts are not: those
are consequences of a shell with dozens of plugins, and reproducing them to host
one lock screen would import the whole architecture to get one feature. Ported
code names its upstream file and the revision it was read from, since the
upstream is a working-tree clone that will drift.

**Deliberately dropped from the upstream's lock path**: the keyboard-layout
reset, which is a no-op with a single layout; the password-manager lock hook,
which has nothing to bind to here; and the screensaver teardown, since the
screensaver is not being imported.

**The Greeter moves to SDDM in its own change, last.** Its theme stays stock:
the greeter runs before login and cannot read the user's theme data, so making
it follow the live theme would mean the theme switcher acquiring a privileged
write for a surface visible for two seconds. The GNOME-greeter power-policy call
is deleted rather than translated — SDDM's greeter runs no GNOME settings
daemon, and the masked sleep target it backstops already covers the case. The
suspend model's documentation drops from four paths to three.

**Package removal happens with the change, not after it.** The replaced daemons
are removed from the package list in the same change that replaces them, and the
Break-glass path is a written runbook rather than a retained installation.
That runbook is `docs/session-lock-break-glass.md`, written and
command-verified before the removal rather than after it.

## Testing Decisions

**A good test here asserts behaviour, not shape.** The valuable subjects are the
lock's state progression and the ladder's stage transitions — both pure decision
logic, both expressible as functions of elapsed time, activity, inhibition and
screen availability. None of it requires a compositor, a display or a password.

**One seam, and it already exists.** The lock's and ladder's decision logic goes
into plain JavaScript modules beside the QML that drives them, mirroring the
Launcher's existing arrangement of pure-logic modules under its own library
directory, tested with the project's existing test runner. The upstream reached
the same split independently, keeping its idle model as plain JavaScript beside
its QML service.

What that seam covers: the ladder's ordering, each Stage's firing and unwinding
on activity, inhibition suppressing the ladder without suppressing manual
actions, the Suspend Stage's absence under the devbox timings, the lock's
progression from requested to Secure, deferral while no real screen exists, and
Stranded Lock detection.

**Wiring drops to the existing source-assertion seam.** The command vectors at
the three lock call sites, the PAM service name, the inhibit-delay value and the
QML wiring are asserted against source text, as the Bar's Quick Settings tests
already do — including the assertion on the lock action that has to change
anyway. This seam is brittle and is used only where the subject genuinely is
structure.

**No new seam for the shell scripts.** The power script's change is one
conditional. ADR 0015 already weighed introducing a shell test harness for this
exact script and declined; one more conditional does not reopen it.

**Test cases are mined from the upstream's harness, not the harness itself.**
Its sleep-lock, idle and lid-close tests drive its own shell over IPC and would
require building that surface to run. Their scenarios become the change's
verification checklist. Its assertion on the inhibit-delay value is copied
literally — that one is a pure configuration check and catches real drift.

**A probe surface makes the work safe.** A separate config renders the lock's
appearance and password field without taking a real session lock, so the visual
and interaction work can be iterated without any possibility of lockout. It is
part of the lock change, not a follow-up.

## Out of Scope

**The screensaver.** The upstream ships one as a feature with its own launcher,
branding assets and toggle. That is scope, not edge-case handling.

**Fingerprint authentication.** No box this repo configures has the hardware.

**Greeter theming.** Covered under Implementation Decisions: stock theme,
deliberately.

**Migration machinery.** The upstream carries versioned migrations for
in-place upgrades of installed systems. This repo re-runs setup instead.

**Replacing the Greeter with a Quickshell greeter.** The toolkit supports it,
and it would unify the Greeter and the Session Lock under one visual language.
It is not attempted here: a self-written greeter that fails to start is a
lockout on a daily driver, and that risk is worth taking only against a lock
that has already proven itself.

## Further Notes

The upstream reference is a working-tree clone at a pinned revision, untracked
by this repository. Anything read from it is a copy taken at a moment, not a
dependency, and it will drift.

The Greeter change is genuinely independent of everything else here and could be
dropped entirely without affecting the rest. It is included because the question
that started this work conflated the Greeter with the Session Lock, and the
boundary is worth recording in the same place as the design that depends on it.

Ordering matters between the two main changes but is forgiving: the existing
idle daemon keeps working against the new lock in between, since its lock
command becomes the new command vector. That makes the lock change independently
shippable and independently revertible, which is worth a great deal given that
package removal is not deferred.
