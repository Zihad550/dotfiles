# 03 — Launcher window opens and dismisses

**What to build:** Press a key, a focused window appears over everything and accepts typing immediately; dismiss it and get back exactly where you were. No content in it yet — this is the window lifecycle proven end to end.

**Blocked by:** 02 — Second Quickshell config with shared theme. Also gated on **unknown 1 in ticket 01**: how the keybind reaches the process (a compositor shortcut registered from QML, or the IPC fallback) decides how this is built.

**Status:** done — verified on the host.

- [x] A keybind shows the Launcher; it floats above other windows and reserves no screen space
- [x] It takes keyboard focus as it maps, so typing works with no click first
- [x] Escape dismisses it, and so does clicking outside it
- [x] Focus returns to the previously focused window on dismiss
- [x] Opening and dismissing repeatedly leaves no stale state and no leaked focus
- [x] Uses on-demand keyboard focus, not exclusive, so a fault cannot hold the keyboard hostage

## Comments

Written from the devcontainer, which has no `quickshell` binary and no Wayland
session, so nothing here is ticked. All six checkboxes describe something
running.

**The gate on unknown 1 turned out to be narrower than the ticket assumed.** It
decides only how the open *signal* arrives, not how the window is built —
overlay layer, no exclusive zone, on-demand focus, Escape, click-outside and
focus return are all independent of the trigger. So the window is built, on the
IPC path, and the trigger is a one-line upgrade later if unknown 1 comes back
yes.

The compositor-shortcut alternative could not be hedged for in `shell.qml`:
naming a type that does not exist is a compile error for the whole file, and a
QML error leaves the *previous* config running, so the failure mode would be
the Launcher silently continuing to work as an older version of itself. IPC is
proven three times in the bar's config. Ticket 10 owns the swap if the probe
says a `GlobalShortcut` type exists; the cost until then is one fork and exec
per open, which is the cost the spec names.

**Update — the probe has since answered yes.** A `GlobalShortcut` registers and
fires (ticket 01). Nothing here needs to change: the window is trigger-agnostic
and verified working on the IPC path, and ticket 10 carries the swap.

What was built:

- `quickshell/.config/quickshell/launcher/modules/Launcher.qml` — the window.
  A `PanelWindow` anchored on all four edges with `exclusionMode:
  ExclusionMode.Ignore`, `WlrLayershell.layer: WlrLayer.Overlay`,
  `WlrLayershell.namespace: "launcher"` and `WlrLayershell.keyboardFocus:
  WlrKeyboardFocus.OnDemand`. The card is centred inside it.
- **Not a `LazyLoader`**, which is how `Osd` and `NotificationPopup` do it.
  Those want no window while idle; this one wants the opposite — the window
  exists at startup and `visible` toggles, so opening costs only mapping the
  surface. That is the whole reason the Launcher is an always-running instance.
  The consequence is that state now survives an open/close cycle by
  construction, which is what the fifth checkbox is really testing, so
  `reset()` exists as the clear point and runs on hide. It is empty today;
  ticket 04's Query and the Marks hang off it.
- **Full-screen, not a small centred window.** A click outside the card is only
  detectable if there is a surface under it to receive the click, so the
  surface covers the output and the backdrop is `Theme.scrim`. The card carries
  a bare `MouseArea` that swallows clicks landing on it.
- `Keys.onEscapePressed` sits on the `FocusScope` that wraps the card, not on
  the card, because key events propagate *up* from whatever holds focus.
  Ticket 04's Query field will be a descendant and will consume printable keys;
  Escape still has to reach past it.
- The card holds a placeholder `Text` so there is something visible to verify
  against. Ticket 04 replaces it.
- `shell.qml` — an `IpcHandler` on target `launcher` with `toggle` (what the
  keybind calls) and `dismiss` (the escape hatch, for a Launcher that somehow
  gets stuck open). Named `dismiss` rather than `hide` because `PanelWindow`
  inherits `show()` and `hide()` from the Qt window type and shadowing those is
  asking for trouble.
- `hypr/.config/hypr/lua/bindings/system.lua` — **SUPER + ALT + SPACE**,
  temporary and non-conflicting. `SUPER + SPACE` stays on walker; ticket 10
  owns that swap and the walker fallback bind.

**No tests.** The spec puts window lifecycle, keyboard routing and delegates
explicitly out of scope for the test seam — they need a running compositor and
are verified by use. The existing 16 matching tests still pass.

**Focus return is left to the compositor.** Hyprland refocuses the previously
focused window when a layer surface gives up keyboard focus, so nothing here
calls `hyprctl`. Step 5 below is what decides whether that assumption holds; if
it does not, this ticket gains an explicit refocus and the address to return to
has to be captured on open. This is the one checkbox where a fail means new
code rather than a wiring fix.

**Multi-monitor is an open question, raised in review.** `screen` is left unset,
as `NotificationPopup` and `Osd` do, so the compositor picks the output. Those
two get away with it because their `LazyLoader` creates the window at show time,
which is exactly what this one refuses to do. So it is unclear whether the
compositor re-picks the active monitor on each map or the output is fixed at
startup — and if it is fixed, the Launcher always opens on whichever monitor was
active at login, and a click on the other monitor dismisses nothing. Step 7
below decides it. If the output is pinned, the fix is to set `screen` on open,
which needs the active monitor from `Quickshell.Hyprland`.

## Host result

All six ticked. Run on the Arch host and reported working — as a blanket pass
rather than pasted output, which is worth recording because two of the six were
genuinely uncertain going in and the evidence for them is a report rather than
a captured address:

- **Focus return** had no implementation. It works, so Hyprland does refocus the
  previously focused window when a layer surface releases the keyboard, and the
  explicit refocus this ticket was ready to gain is not needed. That assumption
  is now load-bearing for every later ticket.
- **The compositor re-picks the output** rather than pinning it at startup, or
  the check was made on a single monitor. See the open question below.

**Still open, and cheap to answer later:** whether the Launcher opens on the
active monitor with HDMI-A-1 connected (step 7 below). Not a blocker — it is
invisible on a single display, and if it turns out to be pinned the fix is to
set `screen` on open from `Quickshell.Hyprland`.

## Manual verification

Closes: all six checkboxes. Kept for re-running after later tickets change the
window.

**Presumes ticket 02's verification block has already been run** — 02 is still
open, and a Launcher instance that is not running or not themed will fail every
step below for reasons that belong to that ticket, not this one.

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
qs -c launcher log        # expect clean before going further
qs -c launcher ipc show   # expect BOTH a `launcher` and a `theme` target
```

**Expected:** no QML errors in the log, and `ipc show` listing a `launcher`
target with `toggle`, `open` and `dismiss`. A QML error keeps the *previous*
config alive rather than crashing, so an instance that seems fine but shows
errors here has not actually reloaded. Check `ipc show` rather than trusting
the keybind: `qs ipc call` exits 0 even for a target that does not exist, so a
missing handler is silent.

Then reload Hyprland so the new bind exists:

```bash
hyprctl reload
# match the dispatcher argument, not the description -- `hyprctl binds` prints
# modmask/key/dispatcher/arg and never the label passed to o.bind.
hyprctl binds | rg -B5 'ipc call launcher'
```

**Expected:** one bind, `modmask` covering SUPER+ALT with `key: space`. Nothing
else in `hypr/.config/hypr/lua/` binds SUPER + ALT + SPACE, so a second hit
here would be a collision — worth knowing, because a shadowed bind presents
identically to a missing IPC handler.

**1. It appears, floats, and reserves no space.** Open a tiled window first so
a reserved zone would be obvious, then press **SUPER + ALT + SPACE**.

**Expected:** a card headed `Launcher` drawn over everything, on a dimmed
backdrop, in the current theme's colours. The window behind it does not resize
or shift — an exclusive zone would push it. Confirm from the compositor's side
rather than by eye:

```bash
hyprctl layers | rg -B2 -A2 launcher
```

**Expected:** a `launcher` namespace in the **overlay** level. Anything in
`top`, or a non-zero exclusive zone, is a fail.

**2. It takes keyboard focus as it maps.** Press the keybind and type
immediately, with no click first. Nothing renders what you type yet, so this is
the check that it does not leak:

**Expected:** the characters do **not** appear in the window behind the
Launcher. If they do, the surface did not take focus. (A layer-shell window
taking focus on map with on-demand focus is already verified once — see the
spec's "Already verified" — so a failure here is this ticket's wiring, not the
platform.)

**If it fails, the first suspect is named:** `open()` calls
`content.forceActiveFocus()` in the same tick as it sets `visible = true`,
which is before the surface has actually mapped. The fix is to move that call
into `onVisibleChanged`. Say whether the keystrokes leaked to the window behind
or went nowhere at all — those point at different halves of this.

**3. On-demand focus, not exclusive.** With the Launcher open:

```bash
hyprctl activewindow      # run from a terminal while the Launcher is open
```

**Expected:** this returns without hanging and the keyboard is not held
hostage. Exclusive focus takes the keyboard from every other surface; the check
that really matters is step 6 — if a stuck Launcher ever leaves you unable to
type anywhere, this is wrong.

**4. Escape dismisses it, and so does clicking outside it.** Try both. Also
press **SUPER + ALT + SPACE** a second time while it is open.

**Expected:** all three dismiss it. The click has to land on the dimmed
backdrop, not on the card — clicking the card must do nothing.

**5. Focus returns to where you came from.** This one needs a before/after,
because "it looks right" is unreliable:

```bash
hyprctl activewindow -j | jq -r .address     # note it
# open the Launcher, then dismiss with Escape
hyprctl activewindow -j | jq -r .address     # expect the same address
```

Repeat with the click-outside dismissal, which is the path more likely to drop
focus. **Nothing in the code does this** — it relies on the compositor
refocusing when the layer surface releases the keyboard. A mismatch here is a
real finding, not a wiring bug, and means this ticket needs an explicit
refocus.

**6. Repeated open/dismiss leaks nothing.** Open and dismiss twenty times,
alternating Escape and click-outside, then:

```bash
qs -c launcher log                                  # expect no accumulating warnings
hyprctl activewindow -j | jq -r .address            # expect the window you started in
hyprctl layers | rg -c 'namespace: launcher'      # expect 0 while dismissed
```

Then open it once more and re-run the last line — a layer block spans several
lines, so match the namespace line rather than counting every line mentioning
"launcher".

**Expected:** no second layer left behind, no growing log, and typing still
works in the window you started in. A leaked layer or lost focus here is the
stale-state failure this checkbox exists for.

**7. Which monitor it opens on.** Raised in review, and not covered by any
checkbox — but it decides whether checkbox 1 and the click-outside half of
checkbox 4 hold on a second display. **Skip this step if you are on a single
monitor**, and say so.

With HDMI-A-1 connected, focus a window on the *other* monitor from the one you
logged in on, then press the keybind.

**Expected:** the Launcher appears on the monitor you are working on. If it
appears on the other one, the output is pinned at startup and needs fixing.

Then, with the Launcher open on whichever monitor it chose, click on the empty
desktop of the *other* monitor.

**Expected:** it does not dismiss — the surface only covers one output — and
that is worth knowing rather than a fail on its own.

```bash
# with the Launcher open
hyprctl layers | rg -B8 'namespace: launcher'
```

**Expected:** tells you which output's layer list the surface is in.

Paste back: the `qs -c launcher ipc show` output, the `hyprctl layers` block
from step 1, the before/after addresses from step 5, anything the log said
during step 6, and for step 7 which monitor it opened on.
