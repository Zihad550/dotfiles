# 05 — Quick Settings inline custom-host field

**What to build:** Reverses the spec's earlier Out of Scope call on this (see
spec.md's Implementation Decisions, "Revision (ticket 05)"). `DevcontainerRoutingRow`
gains a second line — a text field for `~/.local/state/dotfiles/devcontainer-host`
— shown only while the toggle above it is on, following `Volume.qml`'s
"`MenuRow` header + extra content in a `Column`" shape rather than nesting a
field inside `MenuRow`'s own fixed chrome.

The field is pre-filled with the current custom host (blank if unset).
Editing commits on `Enter` or on losing focus — not per keystroke — writing
the trimmed value to `devcontainer-host`. An empty field writes an empty
file, which is already a valid state under the existing contract (blank =
use `devcontainer.devpod`). Turning the toggle off hides the field; nothing
about the toggle's own on/off behavior changes.

**Blocked by:** 03 (done) — builds on the row it added.

**Status:** done — all seven checkboxes closed, verified on the host. See
**Comments**.

- [x] Field appears below the row only while routing is on; hidden while off
- [x] Field is pre-filled with the current `devcontainer-host` content, blank
      if the file is missing or empty
- [x] Typing a host and pressing Enter writes it to `devcontainer-host`, and
      the header row's detail text updates to match
- [x] Typing a host and clicking away (losing focus) commits the same way,
      without needing Enter
- [x] Clearing the field and committing writes an empty file; the header
      row's detail falls back to `devcontainer.devpod`
- [x] Editing the field never touches the toggle file — routing stays on
      throughout
- [x] State survives `df-qs-restart` and a reboot, same as ticket 03

## Manual verification

1. **Field hidden while off.**
   ```
   rm -f ~/.local/state/dotfiles/toggles/devcontainer-routing
   ```
   Open Quick Settings. *Pass:* no field under the Devcontainer row.
2. **Field appears on toggle, pre-filled.**
   ```
   echo "my-other-box" > ~/.local/state/dotfiles/devcontainer-host
   ```
   Click the row to turn routing on. *Pass:* the field appears, already
   containing `my-other-box`.
3. **Edit commits on Enter.**
   Clear the field, type `second-box`, press Enter. *Pass:*
   `cat ~/.local/state/dotfiles/devcontainer-host` prints `second-box`; the
   header row's detail now reads `second-box`.
4. **Edit commits on blur.**
   Clear the field, type `third-box`, click elsewhere in the panel (not
   Enter). *Pass:* same as step 3, with `third-box`.
5. **Clearing falls back to default.**
   Clear the field entirely and press Enter. *Pass:*
   `~/.local/state/dotfiles/devcontainer-host` is empty; the header row's
   detail reads `devcontainer.devpod`.
6. **Survives restart.**
   ```
   df-qs-restart
   ```
   *Pass:* the field still shows the last-committed host; nothing reset.

## Comments

Implemented by restructuring `DevcontainerRoutingRow.qml` from a bare
`MenuRow` into a `Column` (header `MenuRow` + a second `Item` holding the
field), following `Volume.qml`'s two-line-row shape rather than nesting a
field inside `MenuRow`'s own fixed chrome. Commit path (`Enter` or losing
focus) writes through `execDetached` with the value passed as an argv
positional param (`bash -c '...' bash "$stateDir" "$value" "$hostPath"`), no
shell interpolation — same approach the toggle's own `mkdir`+`touch` already
used.

All seven checkboxes were verified directly: a temporary `IpcHandler` in
`Bar.qml` drove the panel and called into the row's real signal paths
(`header.clicked()`, setting `hostInput.text` then invoking its actual
`accepted` signal or dropping its focus) rather than bypassing them, per the
same approach ticket 03 used. Removed before this commit.

Code review caught one real bug this way, fixed before commit: turning the
toggle off while the field still held focus hid it, which drops focus the
same way tabbing away does — the blur handler was committing whatever
half-typed text was there as a side effect of the toggle click, not
something the user asked to save. Fixed by only committing on blur when
`routingEnabled` is still true (`DevcontainerRoutingRow.qml`'s
`onActiveFocusChanged`), and reverified: typing into the field then clicking
the toggle off no longer creates/touches `devcontainer-host` at all, while a
genuine blur (losing focus with routing still on, including the panel
closing) still commits as intended.
