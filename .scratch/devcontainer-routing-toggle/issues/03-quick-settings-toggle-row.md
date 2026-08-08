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

- [ ] Row appears in Quick Settings, below/alongside the Tailscale row
- [ ] On a fresh state directory (no toggle file), the row shows off
- [ ] Clicking the row creates the toggle file and the row updates to show on
- [ ] Clicking again removes the toggle file and the row shows off
- [ ] With the toggle on and a custom host file present, the row's detail
      text shows that host, not `devcontainer.devpod`
- [ ] With the toggle on and no custom host file, the row's detail text
      shows `devcontainer.devpod`
- [ ] State survives `df-qs-restart` and a reboot — it's a file, not
      in-memory state

## Manual verification

Entirely host-only — no compositor in the container this ticket would
otherwise be built in.

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
