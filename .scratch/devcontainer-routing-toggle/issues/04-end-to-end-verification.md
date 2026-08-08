# 04 — End-to-end: one switch, everywhere

**What to build:** Nothing new — this ticket confirms the point of the
whole feature: flipping the Quick Settings row (ticket 03) is the *only*
action needed to change both the Launcher (ticket 01) and the tmux keybind
(ticket 02) together, Zed's static "Connect via SSH → devcontainer.devpod"
profile is unaffected, and no hardcoded copy of `devcontainer.devpod`
survives outside the two state-derived defaults this feature introduced.

**Blocked by:** 01, 02, 03

- [ ] Repo grep confirms `devcontainer.devpod` no longer appears as an
      independent hardcoded literal outside the state-file default fallback
      in the Launcher's directories/files module and `bin/df-tmux-session`
- [ ] With the Quick Settings row off, opening a mirrored directory from the
      Launcher and pressing `SUPER+U` for the same path both stay local
- [ ] Flipping the row on (no custom host) restores both to today's
      `devcontainer.devpod` behavior, unchanged
- [ ] Setting a custom host and leaving the row on routes both the Launcher
      and tmux to that host
- [ ] Zed's manual "Connect via SSH → devcontainer.devpod" profile still
      connects regardless of the row's state, confirming it was correctly
      left untouched by this feature

## Manual verification

The grep is closable from the container; everything else needs the host.

1. **No stray hardcoded host.**
   ```
   grep -rn "devcontainer.devpod" quickshell/.config/quickshell/launcher/lib/ bin/df-tmux-session
   ```
   *Pass:* every hit is the single fallback-default definition in each file,
   not a second independent copy.
2. **One switch, off.**
   Turn the Quick Settings row off. Open `~/dotfiles` from the Launcher and
   press `SUPER+U` on the same directory. *Pass:* both open purely locally.
3. **One switch, on.**
   Turn the row on, no custom host set. Repeat step 2's actions. *Pass:*
   both route to `devcontainer.devpod`, matching pre-feature behavior.
4. **One switch, custom host.**
   Set a custom host, keep the row on. Repeat step 2's actions. *Pass:* both
   route to the custom host.
5. **Zed unaffected.**
   With the row off, use Zed's own "Connect via SSH" picker to reach
   `devcontainer.devpod` directly. *Pass:* it connects, regardless of the
   row's state.
