# ubuntu-lxc-devbox

Headless Ubuntu dev box in an unprivileged Proxmox LXC, used over ssh and
reached through Tailscale. No display: just the shell, editors, agents,
runtimes and Docker.

It is [`ubuntu-devbox`](../ubuntu-devbox) minus everything that needs bare
metal. [`init`](init) calls that box's `packages`, `stow`, `tools` and
`setup-docker` directly, the way `arch-devbox` reuses `arch-workstation`, so a
package or tool added there lands here too.

## order

On the Proxmox host, create the container with
[`../proxmox/ubuntu/create-ubuntu-lxc`](../proxmox/ubuntu/create-ubuntu-lxc).
Its defaults (1 core, 2 GiB RAM, 12 GiB disk) are too small for this setup:

```bash
CT_HOSTNAME=devbox \
CT_USERNAME=jehad \
SSH_AUTHORIZED_KEY_FILE=/root/.ssh/laptop.pub \
CPU_COUNT=4 RAM_MIB=8192 SWAP_MIB=2048 DISK_GIB=40 \
./setup/proxmox/ubuntu/create-ubuntu-lxc

./setup/proxmox/ubuntu/setup-firewall <CT_ID>
pct start <CT_ID>
pct enter <CT_ID>
```

Keep `NESTING`, `KEYCTL` and `TUN` at their default `1`: Docker needs the first
two, Tailscale the third. Set a password when it asks, because `sudo` needs it.

The firewall goes first. It drops all LAN inbound on the container's `net0` and
allows outbound, so apt and Tailscale work. Until `harden-ssh` runs, sshd (from
the template or from `packages`) allows password logins, and setup goes through
`pct enter` anyway, so nothing needs LAN ssh at any point. From then on, the
tailnet is the only network path in.

Inside the container, as your user:

```bash
su - jehad
sudo apt update && sudo apt install -y git
git clone https://github.com/Zihad550/dotfiles.git ~/dotfiles

~/dotfiles/setup/boot.sh ubuntu-lxc-devbox   # or: setup/ubuntu-lxc-devbox/init
~/dotfiles/setup/ubuntu-lxc-devbox/setup-tailscale
~/dotfiles/setup/ubuntu-lxc-devbox/setup-dns   # resolver policy; see ../../docs/dns.md
```

Log out, then from the laptop confirm `ssh jehad@devbox` works over the tailnet
with your key, and finish:

```bash
~/dotfiles/setup/ubuntu-lxc-devbox/harden-ssh
```

| script | what it does |
|---|---|
| `init` | entrypoint; runs `packages`, `../ubuntu-devbox/packages`, `setup-docker`, `../ubuntu-devbox/stow`, `../ubuntu-devbox/tools`, `../common/setup-herdr`, `../common/setup-skills`, sets zsh, records the machine profile |
| `packages` | what the LXC template lacks and Ubuntu Server ships (`add-apt-repository`, sshd, curl), and removes the template's inactive ufw |
| `setup-docker` | `../ubuntu-devbox/setup-docker`, then checks dockerd actually started |
| `setup-tailscale` | checks for `/dev/net/tun`, installs Tailscale, joins the tailnet (wrapper over [`../common/setup-tailscale`](../common/setup-tailscale)) |
| `setup-dns` | installs `systemd-resolved`, stops Proxmox rewriting `/etc/resolv.conf`, applies the Arch devbox resolver policy (wrapper over [`../common/setup-dns`](../common/setup-dns)) |
| `harden-ssh` | key-only sshd, no root, stays on port 22 (wrapper over [`../common/harden-ssh`](../common/harden-ssh)) |

## left out on purpose

| `ubuntu-devbox` step | why not here |
|---|---|
| `setup-tuned`, `setup-no-sleep` | The host owns CPU frequency, power and suspend. |
| `encrypt-data-disk`, `setup-root-autounlock` | The rootfs is a Proxmox volume. Encrypt the host storage instead. |
| `setup-ufw` | The Proxmox firewall filters `net0` from the host. A second firewall inside the guest would only conflict with Docker's iptables rules, so `packages` removes the inactive ufw. |
| `rm-snap` | The LXC template does not ship snapd. |

## access

Tailscale SSH stays off, as on the other devboxes. Ordinary sshd is the access
path over the tailnet, so `harden-ssh` runs with `HARDEN_NET=tailnet` and
`HARDEN_FIREWALL=none`.

`harden-ssh` keeps sshd on port 22 unless `SSH_PORT` names another. With the
LAN closed and Tailscale SSH off, nothing scans the port, so a move only adds a
port to remember; see
[`../common/README.md`](../common/README.md#why-move-the-port).

The break-glass path is `pct enter <CT_ID>` on the Proxmox host. It opens a
root shell without going through sshd or the network, so a broken tailnet or
sshd config never locks you out. Where the shared script's messages talk about
"a keyboard attached to the machine", read that as `pct enter`.

Dev servers are reachable over the tailnet as on `ubuntu-devbox`; see
[its README](../ubuntu-devbox/README.md#exposing-dev-servers-over-tailscale).

## docker

This box uses rootful Docker CE, the same as `ubuntu-devbox`, rather than
`arch-devbox`'s rootless daemon. The container is unprivileged, so its root is
already an unprivileged uid on the host. Rootless Docker inside it would need
nested subordinate uid ranges for little additional isolation.

If `setup-docker` reports that dockerd is not running, check that nesting and
keyctl are on (`pct config <CT_ID> | grep features`). If both are on and
`docker run` fails on a sysctl permission error, update the Proxmox host
packages (`pve-lxc`). Older hosts reject the sysctl writes that newer runc
versions make.
