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

During the Arch installation, select disk encryption, Btrfs, GRUB, and
PipeWire. After configuring Snapper, edit `/etc/snapper/configs/root` and set:

```ini
TIMELINE_LIMIT_HOURLY=0
TIMELINE_LIMIT_DAILY=3
TIMELINE_LIMIT_MONTHLY=1
NUMBER_LIMIT=5
NUMBER_LIMIT_IMPORTANT=2
```
