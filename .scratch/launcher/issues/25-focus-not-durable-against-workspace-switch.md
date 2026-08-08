# 25 — Launcher's keyboard focus isn't durable against a workspace switch

**What to build:** Not yet known — this ticket is the spike. Reported by the
user: open the Launcher (SUPER+SPACE), switch workspace while it's still
visible, and Escape no longer dismisses it — the keypress instead reaches and
acts on the window behind it.

**Status:** needs-info — blocked on the user running the manual verification
below; a `wtype`/`ydotool`-free devcontainer/agent cannot type a key into a
live Wayland session.

- [ ] Confirmed: does `forceActiveFocus()` on an already-mapped, still-visible
      Launcher reclaim the keyboard from the compositor after a workspace
      switch, or is it purely Qt-internal scene focus that changes nothing at
      the Wayland level?
- [ ] Confirmed: does the same loss happen on `SUPER+h`/`SUPER+l` (move focus
      by direction, `hl.dsp.focus({direction=...})`), or only on an actual
      workspace change? Decides whether the problem statement is "workspace
      switching" or "any compositor focus change while the Launcher is open."
- [ ] A fix is designed and shipped, once the two answers above are in.

## What's confirmed already

**The user confirmed the mechanism, not just the symptom.** Escape did
something *inside* the app behind the Launcher — the keypress reached that
window, not `Keys.onEscapePressed` on the Launcher's `FocusScope`
(`Launcher.qml:799`). The Launcher was still open (nothing called
`dismiss()`); it had silently stopped holding the keyboard.

**The trigger is an ordinary Hyprland focus dispatcher, nothing launcher-aware.**
`hl.dsp.focus({ workspace = ... })` (`hypr/.config/hypr/lua/bindings/tiling.lua:38,43-45,60-61`)
is the same dispatcher family as `hl.dsp.focus({ direction = ... })` — a plain
Hyprland-native call, run in-process via the Lua config layer, with nothing
routed through Quickshell.

**The Launcher's `OnDemand` focus is a deliberate, load-bearing choice, not an
oversight.** `Launcher.qml:48-51`: `WlrKeyboardFocus.OnDemand`, "never
Exclusive — Exclusive would take the keyboard from every other surface,
leaving nowhere to type the command that kills a stuck Launcher." Ticket 03
verified only the *transition onto* the keyboard ("takes keyboard focus as it
maps") and dismissal via Escape/click-outside with focus otherwise
undisturbed — never a focus change happening *underneath* an already-open
Launcher. That gap is exactly where this bug lives.

**Naming the conflation directly, since it's the actual finding of this
ticket:** the spec and code both write as if "the Launcher is open" and "the
Launcher holds the keyboard" were the same state. They aren't. `root.visible`
tracks the first; nothing tracks the second.

**Quickshell exposes no way to read "do I currently hold the keyboard" on a
layer surface, at all.** Checked by trying it, twice:

- `onActiveChanged` on the `PanelWindow` root is a load error: *"Cannot
  assign to non-existent property"* — `qs -c launcher log` after a hot
  reload, reproducible on demand.
- The qmltypes confirm why: `ProxyWindowBase`, `PanelWindowInterface` and
  `WlrLayershell` (`/usr/lib/qt6/qml/Quickshell/**/*.qmltypes`) expose
  `focusable` and `keyboardFocus`, both write-only from QML's side (they
  configure the *mode*: Exclusive/OnDemand/None). Nothing readable reports
  whether the surface holds the keyboard right now.

So a fix that watches "the Launcher lost focus" directly, on the Launcher's
own window, does not exist as an API. The candidate below goes around that:
watch a Hyprland-side signal instead (workspace/toplevel changing) and
unconditionally try to reclaim focus whenever it fires while visible, rather
than reacting to a loss we have no way to observe.

**`hyprctl layers` is a reliable, already-precedented open/closed probe** —
`DP-1 3 launcher` appears in the overlay level on toggle, matches ticket 03's
own `hyprctl layers | rg -c 'namespace: launcher'` check. Not the blocker;
recorded here so the verification block below doesn't re-derive it.

## The one open question that decides the whole fix space

Does `TextInput.forceActiveFocus()`, called on an *already-mapped* OnDemand
layer surface, pull the Wayland keyboard focus back from whatever the
compositor just gave it to — or does it only move Qt's internal scene focus
(which item *inside this surface* would get a key, if the surface had the
keyboard at all), doing nothing for a surface that no longer does?

This is a spike, not a design, because both answers are load-bearing for
different things:

- **If yes:** Option "reclaim focus" is a few lines — watch a Hyprland
  signal, call `forceActiveFocus()` while visible, done.
- **If no:** the QML-only branch is dead. The next question is whether
  Hyprland can be told to focus a layer surface on command at all (no
  dispatcher for it is known yet — `hyprctl dispatch` lists dispatchers by
  name only, nothing layer-shell-specific found in this pass). If that's also
  no, the honest outcomes are "accept it" (documented as a known gap) or an
  upstream Quickshell/Hyprland ask — not a workaround that can't be verified
  from either side, since there's also no way to render an honest
  "unfocused" state in the UI without a readable focus property.

## What's already resolved, moot until focus can be held at all

**Where should focus land on dismiss, once mid-session focus has moved?**
Scenario: Launcher opened over a terminal, workspace switched to a browser
mid-session, then dismissed. User Story 8 says "focus returns to the window I
came from" (`docs/launcher-spec.md:53`), which reads as the terminal — but
the resolution here is **whatever's currently active** (the browser), and it
needs no special handling: `OnDemand` release already refocuses the current
window (ticket 03's "Focus return is left to the compositor" finding), which
is exactly "whatever's active now," not a remembered address. Story 8's
wording is loose rather than wrong; not worth editing until this ticket lands
a fix that makes the mid-session case reachable at all.

## The spike in place, ready to test

`Launcher.qml` currently has (on branch `launcher-focus-workspace-switch`):

```qml
import Quickshell.Hyprland
// ...
Connections {
    target: Hyprland
    function onFocusedWorkspaceChanged() {
        if (root.visible)
            query.forceActiveFocus();
    }
}
```

Hot-reloads clean (`qs -c launcher log` shows `Configuration Loaded` with no
error after this edit). This is a spike, not a proposed fix — it answers the
one open question above and nothing else. Remove it once answered, win or
lose.

## Manual verification

Needs a live Wayland session with a keyboard — cannot be run from an agent or
the devcontainer (`docs/agents/issue-tracker.md`'s host-verification rule).

**1. The discriminator.**

- Press **SUPER+SPACE** to open the Launcher.
- Press **SUPER+1** (or any workspace-switch keybind) to switch workspace
  while it's still open.
- Type a single letter.

**Expected if the spike works:** the letter appears in the Launcher's query
line. **Expected if it doesn't:** the letter does nothing visible in the
Launcher, or lands in/affects whatever's now behind it — same failure as
before, meaning `forceActiveFocus()` did not get the keyboard back.

Say which one happened, and paste `qs -c launcher log` from around that time
if anything unexpected shows.

**2. Same test, direction-focus keybind.** Repeat step 1 but use
**SUPER+h** / **SUPER+l** (move focus, not workspace) in place of the
workspace switch.

**Expected:** tells us whether this is "workspace switching" specifically or
"any compositor focus change while the Launcher is open" — the fix (once we
have one) targets a different signal depending on the answer.

**3. Clean up regardless of outcome.** `qs -c launcher ipc call launcher
dismiss` to close it if step 1 or 2 left it open.

## Comments
