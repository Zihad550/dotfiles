# 25 — Launcher's keyboard focus isn't durable against a workspace switch

**What to build:** Reported by the user: open the Launcher (SUPER+SPACE),
switch workspace while it's still visible, and Escape no longer dismisses it
— the keypress instead reaches and acts on the window behind it.

**Status:** done — verified on the host.

- [x] Confirmed: `forceActiveFocus()` on an already-mapped, still-visible
      Launcher does **not** reclaim the keyboard — purely Qt-internal scene
      focus, a no-op once the compositor has moved on. Ruled out by the
      user's own test: the typed letter still landed on the app behind it.
- [x] Confirmed: the same loss happens on `SUPER+h`/`SUPER+l` (move focus by
      direction), not just an actual workspace change — "changes focus for
      the windows below the launcher" too. The problem is "any compositor
      focus change while the Launcher is open," not workspace-switching
      specifically.
- [x] Fixed: `HyprlandFocusGrab` (Hyprland's own grab protocol, the same
      mechanism `QuickSettings.qml`/`SpecialWorkspaces.qml` already use for
      click-outside) holds the keyboard through a workspace switch. Verified
      by the user: the letter now lands in the query line. `Escape` and
      click-outside dismissal both still work — no regression from ticket 03's
      original checklist.

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

## What shipped

Two candidates were tried in sequence on the host, both behind hot-reload so
each was reversible in one edit:

**Candidate 1 (dead): watch `Hyprland.focusedWorkspaceChanged`, call
`query.forceActiveFocus()`.** Loaded clean, changed nothing — confirmed a
no-op by the user's test. Removed.

**Candidate 2 (shipped): `HyprlandFocusGrab`.**

```qml
import Quickshell.Hyprland
// ...
HyprlandFocusGrab {
    windows: [root]
    active: root.visible

    onCleared: root.dismiss()
}
```

Loaded clean against a `PanelWindow`/layer-shell surface — the two existing
uses in this repo (`QuickSettings.qml`, `SpecialWorkspaces.qml`) are both
`PopupWindow`s, so it was an open question whether the protocol accepted a
layer surface at all. It does. `onCleared: root.dismiss()` matches those two
files' own convention (click-outside detection *is* a grab-cleared event for
them) and keeps `visible` truthful if anything other than a workspace switch
ever ends the grab, rather than reintroducing this same bug under a different
trigger.

**Not touched:** `WlrKeyboardFocus.OnDemand` stays as-is (`Launcher.qml:51`).
The grab is the thing holding the keyboard now; OnDemand vs Exclusive was
never the actual lever.

## Resolved, no longer moot

**Where should focus land on dismiss, once mid-session focus has moved?**
Whatever's currently active — no special handling needed, since dismissing
the grab hands the keyboard back to whatever the compositor currently has
focused, not a remembered address. User Story 8's "the window I came from"
(`docs/launcher-spec.md:53`) is loose rather than wrong; not worth editing,
same conclusion as before, now confirmed rather than theoretical.

## Manual verification (run, results below)

**1. The discriminator, candidate 1.** Open the Launcher, switch workspace,
type a letter. **Result:** landed on the app behind it — candidate 1 dead.

**2. Same test, direction-focus keybind (`SUPER+h`/`SUPER+l`).** **Result:**
"yes it changes focus for the windows below the launcher" — confirmed the
problem is any compositor focus change, not workspace-switching specifically.

**3. The discriminator, candidate 2.** Same steps against the
`HyprlandFocusGrab` version. **Result:** letter landed in the Launcher's query
line — fixed.

**4. Regression check against ticket 03's original checklist.** Escape
dismisses, click-outside dismisses. **Result:** "Both still work fine."

## Comments
