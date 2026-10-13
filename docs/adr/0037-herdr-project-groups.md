# Work and personal Herdr Project Groups

[Issue #153](https://github.com/Zihad550/dotfiles/issues/153) replaces the
dedicated generic Herdr shortcut with two Herdr Project Groups. `SUPER+U`
opens session `work` from `~/dev`; `SUPER+I` opens session `personal`
from `~/dotfiles`. These are launch defaults. Users decide which repositories
belong in each session. Neither directory is created by a shortcut.

Each group has its own dotted Ghostty identity, readable title, and Special
Workspace, `herdr-work` or `herdr-personal`. The browser keeps `work`. Ordinary
Launcher terminals and existing generic `herdr` sessions remain independent. No
sessions are renamed, merged, or terminated.

This revises ADR-0007's single-window choice because the user wants two Herdr
Project Groups. Its decision to keep connection mode out of window identity
still applies. ADR-0010's Herdr routing exception also applies. A new window
routes only when Devcontainer Routing is enabled and its launch path is a
Mirrored Directory. Existing windows are focused without changing their
connections or running commands. Remote attachment uses the remote session's
working directory; the local launch directory does not set it.

`df-herdr-session` checks the launch directory only on the local path, since a
routed attach never uses it. This also covers the Launcher's Herdr chooser row
for remote-provenance directories, which have no local copy: they still attach
remotely when routed. A missing local directory fails with a desktop
notification instead of starting Herdr in an unintended working directory,
because the Ghostty window closes before its stderr can be read.

## Workstation verification

Pending until exercised in a live Hyprland session. Automated fixtures check
launch arguments, exact window selection, toggle and return behavior, routing,
and missing directories. They do not establish real Ghostty identities or
Herdr session restoration.

1. Confirm `~/dev` and `~/dotfiles` already exist. Reload the desktop bindings
   with `hyprctl reload`. Press `SUPER+U` and `SUPER+I`. Expect separate
   windows titled `Herdr (work)` and `Herdr (personal)`.
2. Run this in another terminal. Expect one matching window per group on its
   matching Special Workspace, with no browser or ordinary terminal selected.

   ```sh
   hyprctl clients -j | jq '.[] | select(.initialClass == "io.github.zihad550.dotfiles.herdr.work" or .initialClass == "io.github.zihad550.dotfiles.herdr.personal") | {initialClass, title, workspace: .workspace.name}'
   ```

3. Create distinct tabs in each session and run `sleep 600` in one pane in each.
   Alternate `SUPER+U` and `SUPER+I`. Expect the intended group each
   time and both commands to keep running. Press the visible group's shortcut
   again. Expect it to hide and return to the previous Special Workspace when
   applicable.
4. Close a group's terminal window while keeping its Herdr session alive.
   Press its shortcut again. Expect attachment to the same named session with
   the existing tabs and command intact.
5. With both windows open, change Devcontainer Routing in Quick Settings.
   Alternate the shortcuts. Expect the existing windows and connections to
   remain intact. Close and reopen a window. Expect the new attachment to follow
   the toggle and configured host. With routing off, expect local attachment
   in the group's launch directory.
6. Open an ordinary Launcher Herdr terminal and the work browser. Expect the
   dedicated shortcuts to select only their matching group terminals.
7. With routing off, run the command below. Expect a critical `Herdr`
   notification naming the missing directory and no Herdr client.

   ```sh
   ~/dotfiles/bin/df-herdr-session work "$HOME/dev/no such project"
   ```
