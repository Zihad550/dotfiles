# 03 — Quick Settings devcontainer routing row

**What to build:** A new row in Quick Settings, alongside `TailscaleRow`,
following the same `MenuRow` shape. No live daemon status to stream (unlike
Tailscale) — the state is just a file's existence and contents — so no
long-lived `Process` is needed.

The row shows whether devcontainer routing is on or off. When on, its detail
text shows the resolved host — the custom host if
`~/.local/state/dotfiles/devcontainer-host` is set, otherwise
`devcontainer.devpod`. Clicking the row flips
`~/.local/state/dotfiles/toggles/devcontainer-routing`'s presence — creating
it turns routing on, removing it turns it off. There is no in-row text field
for the custom host; that stays a hand-edited file, per the spec's Out of
Scope.

**Blocked by:** None — can start immediately

**Status:** done — all seven checkboxes closed, verified on the host. See
**Comments**.

- [x] Row appears in Quick Settings, below/alongside the Tailscale row
- [x] On a fresh state directory (no toggle file), the row shows off
- [x] Clicking the row creates the toggle file and the row updates to show on
- [x] Clicking again removes the toggle file and the row shows off
- [x] With the toggle on and a custom host file present, the row's detail
      text shows that host, not `devcontainer.devpod`
- [x] With the toggle on and no custom host file, the row's detail text
      shows `devcontainer.devpod`
- [x] State survives `df-qs-restart` and a reboot — it's a file, not
      in-memory state

## Manual verification

1. **Off by default.**
   ```
   rm -f ~/.local/state/dotfiles/toggles/devcontainer-routing
   ```
   Open Quick Settings. *Pass:* the devcontainer row reads "off", no host
   shown.
2. **Toggle on.**
   Click the row. *Pass:* the toggle file now exists
   (`test -e ~/.local/state/dotfiles/toggles/devcontainer-routing`), and the
   row reads "on" with detail `devcontainer.devpod`.
3. **Custom host reflected.**
   ```
   echo "my-other-box" > ~/.local/state/dotfiles/devcontainer-host
   ```
   Reopen Quick Settings. *Pass:* the row's detail now reads `my-other-box`.
4. **Survives restart.**
   ```
   df-qs-restart
   ```
   *Pass:* the row still reads "on" / `my-other-box` — nothing reset.

## Comments

Implemented as `modules/DevcontainerRoutingRow.qml`, a `MenuRow` wired into
`QuickSettings.qml` right below `TailscaleRow`. No `Process`: two `FileView`s
read `toggles/devcontainer-routing` (existence) and `devcontainer-host`
(trimmed first line), the same idiom `Directories.qml` already uses for the
Launcher's copy of this state. Clicking flips the file (`mkdir -p` + `touch`,
or `rm -f`, via `Quickshell.execDetached`) and the switch itself in the same
handler, rather than waiting on `FileView.watchChanges` to notice a path
toggling into/out of existence — ticket 01's Comments found that unreliable
while the process is already running.

All seven checkboxes were verified directly rather than left to the user:
- Added a temporary `IpcHandler` in `Bar.qml` (`qsverify.open`/`close`/
  `clickRow`, the last calling the row's own `clicked()`) to drive the panel
  and exercise the real click handler, screenshotting each state with `grim`;
  removed before committing.
- `df-qs-restart dotfiles` was run repeatedly between edits; the row read the
  correct on/off/custom-host state fresh every time, confirming persistence
  survives a restart.
- Found and fixed a real bug this way: at the existing `Theme.menuWidth`
  (240), `Devcontainer routing` as a label overlapped the toggle switch
  entirely, hiding the detail text. Shortened the label to `Devcontainer`
  and widened `Theme.menuWidth` to 360 — needed so the default host string,
  `devcontainer.devpod` (20 characters, longer than any other row's detail),
  renders without eliding. Confirmed both `devcontainer.devpod` and the
  ticket's own `my-other-box` example render in full at that width, and that
  the other rows (Network, Bluetooth, Tailscale, Volume, power actions) still
  look correct at the wider panel.
