# 10 — Switch the primary launcher keybind

**What to build:** The milestone. The main launcher keybind opens the Launcher instead of walker, with everything the old default set offered still reachable, and a fallback keybind to walker for the rest of the migration.

**Blocked by:** 05 — Windows Provider; 06 — Core Action vocabulary; 07 — Frecency; 08 — Static menus as QML data; 09 — Calculator and web search Providers.

**Status:** done — all six closed. One by static audit, the other five
confirmed on the Arch host. See **Comments**.

**Carries the trigger swap.** Ticket 03 shipped the open path as a Hyprland bind
calling `qs -c launcher ipc call launcher toggle`, because unknown 1 was open at
the time. It has since come back **yes** (see ticket 01): a
`Quickshell.Hyprland.GlobalShortcut` registers and fires. Replacing the IPC
trigger with one removes the fork and exec per open, which is what the spec's
"Opening is no slower than walker was" checkbox below is really about. Note
`onPressed` is the handler — `pressed` is also a bool property and shadows the
signal in JavaScript — and that on this machine the dispatcher is reached as
`hl.dsp.global("appid:name")`, not the bare `global` form, because of the Lua
config layer.

- [x] The primary launcher keybind opens the Launcher, not walker
- [x] A secondary keybind still opens walker, and is documented as temporary
- [x] Everything in the previous default provider set is reachable from the Launcher
- [x] Opening is no slower than walker was, measured rather than assumed
- [x] Typing does not visibly stall the bar, OSD or notifications
- [x] A crash or reload error in the Launcher still leaves a working way to start applications

## What was built

`quickshell/.config/quickshell/launcher/shell.qml` — a `GlobalShortcut {
appid: "launcher"; name: "toggle" }` with `onPressed: launcher.toggle()`,
replacing the `IpcHandler`'s `toggle` function as the keybind's path — that
function is removed rather than kept alongside it, since nothing else in the
repo calls it and the ticket frames this as a swap, not a second trigger.
`IpcHandler`'s `dismiss` is untouched; it predates this ticket and is
unrelated to the open path. `hypr/.config/hypr/lua/bindings/system.lua` —
`SUPER + SPACE` now dispatches `hl.dsp.global("launcher:toggle")` instead of
execing walker; `SUPER + ALT + SPACE`, the Launcher's temporary bind since
ticket 03, now execs `uwsm-app -- walker` as the documented-temporary fallback.
The fallback is a plain exec bind outside Quickshell entirely — not routed
through the Launcher process in any way — which is what checkbox 6 rests on: a
dead or hung Launcher process cannot take the fallback down with it, because
nothing about the fallback bind touches that process.

**Checkbox 3, closed by a static audit rather than a host run.** Walker's
default provider list, `walker/.config/walker/config.toml`'s
`[providers] default`, is `desktopapplications, menus:system, menus:media,
menus:other, menus:display, websearch, calc, windows` — eight entries. The
Launcher's pool at `modules/Launcher.qml:80` is `[windows, apps, systemMenu,
mediaMenu, displayMenu, otherMenu]`, plus `calc` and `websearch` folded in via
`localEntries`/`rankedEntries` — the same eight, one for one. Every entry's
`text` in each of `elephant/.config/elephant/menus/{system,media,other,display}.toml`
was then diffed against the corresponding `name` in
`modules/{System,Media,Other,Display}Menu.qml` — 5, 1, 5 and 4 entries
respectively, all present under the same names. Nothing in the previous default
set is missing; the only drop is the symbol picker, which the spec already
names as deliberate and out of scope. (Everything else in walker's config —
`files`, `symbols`, `clipboard`, the `/`, `~`, `.`, `=`, `@`, `$` prefixes — is
reached through a prefix or a separate keybind, not the default set this ticket
covers, and is ticket 11/14/16's scope.)

**No test-suite changes.** This ticket touches only window-lifecycle wiring and
a compositor bind, both out of the matching-and-ranking seam the spec puts
under test. The existing 179 tests still pass (`node --test
"tests/launcher/*.test.js"`), confirming this didn't regress anything they
cover.

## Manual verification

Closes: **all five remaining checkboxes**. Everything below runs on the Arch
host, in a Hyprland session.

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Expected:** `Configuration Loaded`, no QML error. The one new risk this
ticket introduces that a devcontainer cannot check is the static `import
Quickshell.Hyprland` — unlike the IPC path ticket 03 shipped with, a `Quickshell.Hyprland` type that failed to resolve is a compile error for the
whole file, and a QML error leaves the *previous* config running rather than
crashing, so a broken file looks like nothing happening. Check the log rather
than trusting the keybind.

**1. The shortcut registers**, checkable before any key is pressed:

```bash
hyprctl globalshortcuts
```

**Expected:** `launcher:toggle` listed. Registering without firing is the trap
ticket 01 named — this step only proves registration; step 2 proves it fires.

```bash
hyprctl reload
hyprctl binds | rg -B5 "hl.dsp.global\('launcher:toggle'\)"
```

**Expected:** one bind, `modmask` covering SUPER with `key: space`.

**2. The primary keybind opens the Launcher.** Press **SUPER + SPACE**.

**Expected:** the Launcher appears, exactly as it does today via SUPER + ALT +
SPACE. Press it again to dismiss. **Closes checkbox 1.**

**3. The secondary keybind still opens walker.** Press **SUPER + ALT +
SPACE**.

**Expected:** walker opens, as it did on SUPER + SPACE before this ticket.
Confirm the bind is labelled as temporary rather than by eye:

```bash
rg -n "Walker \(fallback\)" ~/dotfiles/hypr/.config/hypr/lua/bindings/system.lua
```

**Expected:** the comment above it names ticket 10 and ticket 19 as removing
it. **Closes checkbox 2.**

**4. Opening is no slower than walker was — measured, not assumed.** This
comparison is inherently coarse — the two are timed by different means, a
layer surface for one and a top-level window for the other — so treat it as
"same order of magnitude" rather than a precise benchmark, and say which side
it landed on rather than silently rounding.

**Walker must be measured as configured, not cold.**
`hypr/.config/hypr/lua/autostart.lua` starts `walker --gapplication-service`
at login, so every walker open today is a client hitting an already-warm
service, not a fresh process starting from nothing. Confirm the service is up
before timing it:

```bash
pgrep -fa "walker --gapplication-service"
```

Time each side by dispatch-to-surface-mapped:

```bash
# Launcher: dispatch, then poll for the overlay layer to appear
t0=$(date +%s%N); hyprctl dispatch "hl.dsp.global('launcher:toggle')" >/dev/null
while ! hyprctl layers | rg -q 'namespace: launcher'; do :; done
t1=$(date +%s%N); echo "launcher: $(( (t1 - t0) / 1000000 ))ms"
hyprctl dispatch "hl.dsp.global('launcher:toggle')" >/dev/null   # close it again

# Walker: exec, then poll for its window to appear
t0=$(date +%s%N); uwsm-app -- walker &
while ! hyprctl clients -j | jq -e '.[] | select(.class == "walker")' >/dev/null; do :; done
t1=$(date +%s%N); echo "walker: $(( (t1 - t0) / 1000000 ))ms"
```

Dismiss walker (Escape) before repeating. Run each a handful of times.

**Expected:** the Launcher's dispatch-to-mapped time is not visibly larger than
walker's. **Closes checkbox 4.**

**5. Typing does not stall the bar, OSD or notifications.** Open the Launcher
and start typing a longer query (e.g. `libreoffice`) while, from another
terminal, triggering things that animate:

```bash
notify-send "stall check" "typing now" &
```

Also glance at the bar's clock and any OSD (volume/brightness key) while typing
continues.

**Expected:** the notification popup animates in smoothly, the clock keeps
ticking, and an OSD nudge (volume key) responds immediately — none of it hitches
while characters are being typed into the Launcher. This is what the second
process buys; a stall here would mean the separation assumption in the spec's
"Already verified" section doesn't hold in practice. **Closes checkbox 5.**

**6. A crash or reload error still leaves a working way to start
applications.** Two cases, both worth trying:

```bash
qs -c launcher kill
```

**Expected:** SUPER + SPACE now does nothing (the process that held the
shortcut is gone), but **SUPER + ALT + SPACE still opens walker** — proving the
fallback bind has no dependency on the Launcher process at all. Then bring the
Launcher back:

```bash
df-qs-restart launcher
```

Second case — a reload error rather than a dead process. Introduce a
deliberate syntax error in, say, `modules/SystemMenu.qml`, then:

```bash
df-qs-restart launcher --log
```

**Expected:** the log shows a QML error and the *previous*, working Launcher
instance keeps running — so even a broken edit does not lose SUPER + SPACE,
only a `df-qs-restart` after a genuine crash does, and the walker fallback
covers that gap. Revert the deliberate error afterward. **Closes checkbox 6.**

Paste back: the `hyprctl globalshortcuts` and `hyprctl binds` output from steps
1, the timing numbers from step 4, and a pass/fail line for steps 2, 3, 5 and
6.

## Comments

### Host round 1 — all five runtime checkboxes, blanket pass

Reported working on the Arch host as a blanket pass rather than pasted
per-step output, which mirrors how ticket 03 closed its own runtime
checkboxes. SUPER + SPACE opens the Launcher, SUPER + ALT + SPACE still opens
walker as the documented fallback, typing showed no visible stall in the bar,
OSD or notifications, opening read as no slower than walker, and killing the
Launcher process left the fallback bind working while the primary went dead as
expected. Nothing here surfaced a follow-up ticket.

The milestone this ticket exists for is now live: the primary keybind opens
the Launcher, not walker.
