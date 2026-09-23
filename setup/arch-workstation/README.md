# Arch workstation

This profile is a client for a separate development server. It installs the
desktop, SSH and Tailscale clients, Herdr, Zed, Neovim, and database clients.
It does not provision general language toolchains, container engines, local AI
coding agents, or development services.

Syncthing runs as a user service. Its setup does not create or configure a
local `~/dev` tree. The firewall does not open Syncthing inbound, so this
machine must initiate connections to configured peers.

Helium is the workstation-owned AUR package. Installing and updating it
requires `yay` and the `base-devel` build tools, including a compiler. Chromium
is not installed by this profile.

The native Zed package and its dependencies remain unchanged.

GitHub CLI uses SSH for Git operations on the workstation. After
`gh auth login`, run `setup-packages/setup-github-cli` to set the protocol and
install `gh-dash`.

MongoDB Compass and Beekeeper Studio cover MongoDB and SQL administration.
They run as Flatpaks and connect to databases over the network or an SSH
tunnel.

After setup, join the tailnet and add the server to `~/.ssh/config`:

```sh
sudo tailscale up --operator="$USER"
ssh devbox
herdr --remote devbox
```

Zed can then open the same host through its remote-development UI.

## Installation notes

### LocalSend on an existing workstation

Run these steps on the **workstation**, after updating its `~/dotfiles` checkout
to include this change. Do not run workstation setup on an arch-devbox.

1. Ensure the workstation's Omarchy package repository is configured. Existing
   installations made with this setup already have it. If it is missing, run
   `bash ~/dotfiles/setup/arch-workstation/setup-omarchy-repos` first.
2. Install LocalSend, its Nautilus integration, and the file chooser backend:

   ```sh
   cd ~/dotfiles
   sudo pacman -Syu
   bash setup/arch-workstation/setup-packages/setup-localsend
   ```

3. Allow LocalSend through the existing firewall:

   ```sh
   sudo ufw allow 53317/tcp comment 'LocalSend'
   sudo ufw allow 53317/udp comment 'LocalSend'
   sudo ufw reload
   sudo ufw status
   ```

   These allow incoming transfers from any network while LocalSend is listening.
   Full workstation setup also creates these rules through `setup-ufw`.

4. Refresh desktop links and assert the workstation profile:

   ```sh
   bash scripts/stow/stow-hyprland
   bash setup/common/set-dotfiles-profile arch-workstation
   ```

5. Log out and back in. This gives Hyprland, the Launcher, Nautilus, and the
   portal services the correct session environment and loads the new extension.
6. Press `Super+Alt+S`, or open the Launcher and type `?` to select Share.
   Use Receive to open LocalSend, or send clipboard text, files, or a folder.
   Nautilus selections also offer **Send via LocalSend**. Open LocalSend on a
   second device on the same network and test a transfer in both directions.

Receiving is on demand, with no login autostart. Clipboard images are not
supported by the Share action; save an image and use Send files instead.
LocalSend's existing preferences are preserved. See the
[port specification](../../docs/localsend-spec.md) for upstream provenance.

### Media

The workstation installs mpv and mpv-mpris and registers mpv for video files.
The Calendar Panel's Media Controls show the active track, artwork, previous,
play/pause, and next actions, plus player selection when multiple players are
available. Media keys use Omarchy's original targeting rules; Shift+Play or
Shift+Pause cycles players and transfers playback. The controls and service
are enabled only for `DOTFILES_PROFILE=arch-workstation`.

Existing installations can install `mpv-mpris`, run
`bash setup/arch-workstation/setup-packages/setup-media`, and restart the
dotfiles Quickshell instance. Restart any already-open mpv process to load its
MPRIS plugin. Browser downloads and screen-recording integration are excluded.
See the [port provenance](../../quickshell/.config/quickshell/dotfiles/media/PROVENANCE.md).

### Disk setup

During the Arch installation, select disk encryption, Btrfs, GRUB, and
PipeWire. After configuring Snapper, edit `/etc/snapper/configs/root` and set:

```ini
TIMELINE_LIMIT_HOURLY=0
TIMELINE_LIMIT_DAILY=3
TIMELINE_LIMIT_MONTHLY=1
NUMBER_LIMIT=5
NUMBER_LIMIT_IMPORTANT=2
```
