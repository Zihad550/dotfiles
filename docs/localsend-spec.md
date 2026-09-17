# LocalSend workstation port

Status: implemented in the repository. Apply it only on the workstation using
the steps in `setup/arch-workstation/README.md`.

## Agreed scope

Port Omarchy's full Share workflow to `arch-workstation`: clipboard text, files,
folders, and opening LocalSend to receive. Include Nautilus right-click sharing
and LocalSend window rules. Receiving is opened on demand; setup does not start
LocalSend at login.

Allow incoming TCP and UDP on port 53317 from any source, matching Omarchy.
This accommodates changing Wi-Fi networks without maintaining a network list.
The allowance also applies on public networks while LocalSend is listening.

Adapt the workflow to this repository's Launcher and Hyprland conventions.
Runtime integrations shared with other setup targets must use the existing
`DOTFILES_PROFILE=arch-workstation` contract.

## Desktop behavior

Share appears in the Launcher's `?` provider list. `Super+Alt+S` opens it
directly; `Super+Ctrl+S` keeps its existing Suspend action. The four actions
are also searchable in the main Launcher.

Clipboard sharing sends text as a temporary `.txt` file. Omarchy does not
detect clipboard images or give them an image filename; its untyped capture
can write binary data into that `.txt` file. This port requests text explicitly
and reports empty or unsupported clipboard content. Temporary clipboard files
remain for system cleanup after a successful launch because LocalSend may hand
the transfer to an existing process.

File and folder actions use the desktop portal chooser. Cancellation does
nothing. Chooser and launch failures produce an error notification. Paths stay
separate arguments, including filenames with spaces or newlines. Nautilus
sharing supports local paths and uses the same helper.

Setup preserves LocalSend preferences. There is no tray integration to remove
in this desktop. No packages, firewall changes, or session restarts are applied
to the arch-devbox while developing this port.

## Upstream reference

Ported from Omarchy commit `9c5482c58dbe4974de337450754885083c91eada`.
The upstream license is retained at
`setup/arch-workstation/localsend/LICENSE.omarchy`.

- `resources/omarchy/bin/omarchy-menu-share`: clipboard capture, file/folder
  selection, and detached sending.
- `resources/omarchy/default/omarchy/omarchy-menu.jsonc`: four Share actions.
- `resources/omarchy/default/hypr/bindings/utilities.lua`: Share shortcut.
- `resources/omarchy/default/hypr/apps/localsend.lua`: window rules.
- `resources/omarchy/default/nautilus-python/extensions/localsend.py`:
  Nautilus sharing.
- `resources/omarchy/install/config/firewall.sh`: incoming port allowances.

The port should report clipboard, chooser, and launch failures instead of
copying the upstream wrapper's unchecked clipboard capture and launch status.
