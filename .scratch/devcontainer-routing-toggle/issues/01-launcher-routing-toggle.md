# 01 — Launcher respects the routing toggle + custom host

**What to build:** Opening a directory from the Launcher — or picking one of
its chooser apps (Zed, VSCode, Cursor, Neovim) — reads the devcontainer
routing state at the moment of the action, rather than always routing a
mirrored directory over SSH.

With the enabled flag absent, every app opens locally, even for a directory
under the mirrored allowlist (`~/dev`, `~/dotfiles`, `~/.agents`) — routing
overrides the mirrored check rather than layering on top of it. With the
flag present and no custom host configured, behavior is unchanged from
today's hardcoded `devcontainer.devpod` routing. With the flag present and a
custom host configured, every `ssh://` URL and `--remote ssh-remote+<host>`
argv uses that host instead. `isMirrored`'s own answer — whether a path is
structurally inside the devcontainer's mounts — stays untouched by any of
this.

Per `docs/adr/0002-devcontainer-routing-toggle.md` and the spec's
Implementation Decisions, the routing decision and resolved host are
computed once and threaded through the directories/files Provider's pure
functions as explicit parameters — no state-file I/O inside those functions
themselves. Reading `~/.local/state/dotfiles/toggles/devcontainer-routing`
(presence = on) and `~/.local/state/dotfiles/devcontainer-host` (single
trimmed line, blank/missing = default) happens at the QML layer, the same
boundary that already reads the directory cache file before handing its
contents to `parseCache`.

**Blocked by:** None — can start immediately

- [ ] `node --test` covers: routing disabled → local argv for a mirrored
      path, identical to what an unmirrored path already returns
- [ ] `node --test` covers: routing enabled, no custom host → output
      byte-identical to today's hardcoded-host behavior
- [ ] `node --test` covers: routing enabled, custom host set → every ssh
      target (`ssh://`, `--remote ssh-remote+<host>`, the Neovim `ssh -t
      <host>` argv) uses the custom host, not the default
- [ ] `node --test` covers: `isMirrored`'s output is unaffected by routing
      state — still a function of path and `$HOME` alone
- [ ] Opening a mirrored directory from the Launcher with the enabled flag
      absent opens every app locally
- [ ] Opening the same directory with the flag present and no custom host
      opens over SSH into `devcontainer.devpod`, unchanged from before this
      ticket
- [ ] Opening the same directory with a custom host file set opens over SSH
      into that host instead

## Manual verification

The last three checkboxes need a real Quickshell session; the `node --test`
ones can be closed from the container.

1. **Routing off.**
   ```
   rm -f ~/.local/state/dotfiles/toggles/devcontainer-routing
   ```
   Open `~/dotfiles` from the Launcher. *Pass:* Zed opens the local path, no
   `ssh://` involved.
2. **Routing on, default host.**
   ```
   mkdir -p ~/.local/state/dotfiles/toggles && touch ~/.local/state/dotfiles/toggles/devcontainer-routing
   rm -f ~/.local/state/dotfiles/devcontainer-host
   ```
   Open `~/dotfiles` from the Launcher. *Pass:* Zed opens
   `ssh://devcontainer.devpod/home/<user>/dotfiles`.
3. **Routing on, custom host.**
   ```
   echo "my-other-box" > ~/.local/state/dotfiles/devcontainer-host
   ```
   Open `~/dotfiles` from the Launcher again. *Pass:* Zed opens
   `ssh://my-other-box/home/<user>/dotfiles`.
