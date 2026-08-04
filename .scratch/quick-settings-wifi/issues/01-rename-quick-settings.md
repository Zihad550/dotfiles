# 01 — Rename the gear menu to Quick Settings

**What to build:** The panel under the bar's gear is called Quick Settings everywhere — the glossary, the filename, and every comment. Pure rename, no behaviour change.

**Blocked by:** None — can start immediately. Should land as its own commit
*before* the Wi-Fi work, so those diffs carry no naming noise.

**Status:** needs-info — code done, waiting on the host run below.

- [x] `CONTEXT.md` has a Bar section defining Quick Settings, Gear, Row, Page
- [x] `SettingsMenu.qml` is renamed `QuickSettings.qml` and its use site updated
- [x] No comment in `quickshell/.config/quickshell/dotfiles/` says "gear menu"
- [x] References to *the gear* as the bar button are left alone
- [ ] The bar still loads and the panel still opens

## Why

Two names for one thing: the code says "gear menu" throughout, and every major
desktop — GNOME, Android, Windows 11 — calls this Quick Settings. "Gear menu"
also names the button that opens the panel rather than the panel itself, so it
breaks the moment the icon changes.

The distinction to preserve: **the gear** is the bar item and keeps its name
(`Bar.qml`'s `id: gear` is correct). Only *gear menu*, the panel, is renamed.

## Files

`CONTEXT.md` is already done — the Bar section was written during the design
session. The remaining sweep:

- `modules/SettingsMenu.qml` → `modules/QuickSettings.qml` (4 comment mentions)
- `modules/Bar.qml` — the `SettingsMenu { }` use site
- `modules/MenuRow.qml`, `modules/NetworkItem.qml`, `modules/BluetoothItem.qml`,
  `modules/Volume.qml`, `modules/Battery.qml`, `modules/TailscaleRow.qml`,
  `modules/SpecialWorkspaces.qml` — comment mentions

## Manual verification

Host-only: the panel opening is a runtime fact.

```bash
df-qs-restart && rg -n "gear menu" quickshell/.config/quickshell/dotfiles/
```

**Pass:** the bar comes back up, `rg` prints nothing, and clicking the gear
still opens the panel with every row present.

## Comments

Done, except the runtime checkbox.

`git mv` kept the history — git records it as a rename, so `git log --follow`
still reaches the file's past.

Two things the plan above got slightly wrong, both found by grepping after the
edit rather than before:

- **`scripts/tailscale-toggle.sh` also said "gear menu".** The file list was
  built from a grep restricted to `*.qml`, `*.md` and `*.lua`, which missed the
  shell scripts under `dotfiles/scripts/`. Swept.
- **`Bar.qml`'s `id: menu` was worth renaming too**, not just the type. It is
  now `id: quickSettings`, which is what the two bindings that read it
  (`quickSettings.shown`, `quickSettings.toggle()`) should say.

Beyond the literal string, a few comments referring to the panel as "the menu"
in running prose were reworded to "the panel" — `MenuRow`'s `closeRequested`
note, `QuickSettings`' `lastCleared` note, and the anchor comment. `MenuRow`
itself keeps its name: it is the shared row chrome, and renaming the component
is churn this ticket does not need. Ticket 05 is what changes that file's
behaviour.

Untouched deliberately: every use of *the gear* meaning the bar button —
`Bar.qml`'s `id: gear`, and the anchor comments in `QuickSettings.qml` and
`SpecialWorkspaces.qml`. That distinction is the point of the Gear entry in the
glossary.
