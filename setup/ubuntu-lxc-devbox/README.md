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
It asks for every value. Its defaults (1 core, 2 GiB RAM, 12 GiB disk) are too
small for this setup, so either answer the questions or pass the sizes and
`--defaults`:

```bash
CT_HOSTNAME=devbox \
CT_USERNAME=jehad \
SSH_AUTHORIZED_KEY_FILE=/root/.ssh/laptop.pub \
CPU_COUNT=4 RAM_MIB=8192 SWAP_MIB=2048 DISK_GIB=40 \
./setup/proxmox/ubuntu/create-ubuntu-lxc --defaults

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
~/dotfiles/setup/ubuntu-lxc-devbox/setup-dns   # resolver policy; see https://github.com/Zihad550/arch-desktop/blob/main/docs/dns.md
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
| `setup-devvm` | optional DevVM host: installs QEMU, DevVM and Lima, links the portable layers and defaults new VMs to `shell,desktop` |
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

## devvm

The LXC can host [DevVM](https://devvm.dev/docs/getting-started/install/) VMs
with its built-in [Xfce `desktop` layer](https://devvm.dev/docs/using/desktop/).
The LXC stays headless; Xfce runs inside a VM. This is separate from the
`arch-desktop` coding layer in [the portable layers guide](../../devvm/README.md).
Allow room for both the LXC tools and its VMs: start with 4 CPUs, 16 GiB RAM
and 80 GiB disk for a box that will run a 4 GiB desktop VM. Multiple VMs need
more memory and disk.

### KVM passthrough

Finish the normal LXC setup first. On the Proxmox host, `/dev/kvm` must exist;
enable hardware virtualization in firmware if it does not. If Proxmox itself
runs in a VM, its hypervisor must expose virtualization to it as well.

Run this as root on Proxmox while the container is running. It grants the
login user's primary group access to KVM inside the guest, without making
the device world-writable. `dev0` remains the TUN device. If `dev1` is already
occupied, use another free `devN` slot in the block. The shutdown/start
disconnects existing sessions, so save work first.

```bash
(
    set -euo pipefail
    read -rp 'Container ID: ' ct_id
    read -rp 'Container login user: ' ct_user
    test -c /dev/kvm
    if pct config "$ct_id" | grep -q '^dev1:'; then
        echo 'dev1 is occupied; choose an unused devN slot in this block.' >&2
        exit 1
    fi
    guest_gid=$(pct exec "$ct_id" -- id -g "$ct_user")
    pct set "$ct_id" --dev1 "path=/dev/kvm,gid=$guest_gid,mode=0660"
    pct shutdown "$ct_id" --timeout 60
    pct start "$ct_id"
)
```

This uses Proxmox's [device passthrough options](https://github.com/proxmox/pve-docs/blob/master/generated/pct.conf.5-opts.adoc).
Keep the container unprivileged with nesting enabled; no AppArmor override or
GPU passthrough is needed for the software-rendered desktop.

### Install and create a VM

Log in to the LXC as your normal user and run:

```bash
test -c /dev/kvm && test -r /dev/kvm && test -w /dev/kvm
~/dotfiles/setup/ubuntu-lxc-devbox/setup-devvm
devvm doctor
```

The first command must exit successfully, and `devvm doctor` must report no
missing requirements. The installer verifies the upstream release signature
and the install script's checksum before running it. Existing DevVM and Lima
installations are kept; use `devvm upgrade` for updates. A real existing
`~/.config/devvm/layers` directory must be merged into the repo's layers before
setup can link it. `XDG_CONFIG_HOME` is respected when set.

Create a project and its VM inside the LXC:

```bash
mkdir -p ~/dev/desktop-demo
cd ~/dev/desktop-demo
devvm --here --layers shell,desktop --tools node --agents claude,codex --cpus 4 --memory 4
```

Exit the VM shell to return to the LXC. New VMs default to `shell,desktop`,
but an explicit `--layers` replaces that list: include `desktop` with any
project layers you select. For an existing VM, save and push work outside its
home and project folders, then run `devvm layer add desktop` from its project
in the LXC. That rebuilds the VM and retains its home and project, but replaces
the rest of its disk after confirmation. See [DevVM layers](../../devvm/README.md)
for agent skills and settings inside the shell layer.

### Connect to Xfce

In an SSH session to the LXC, from the project directory:

```bash
cd ~/dev/desktop-demo
devvm desktop --no-open
```

Leave it running. It prints a `vnc://127.0.0.1:PORT` address and a password.
In a second terminal on your laptop, forward that port over your existing
SSH connection (use your SSH alias if you configured a different SSH port):

```bash
read -rp 'LXC SSH destination (user@host or SSH alias): ' lxc_ssh
read -rp 'Port printed by devvm desktop: ' desktop_port
ssh -N -o ExitOnForwardFailure=yes -L "5901:127.0.0.1:$desktop_port" "$lxc_ssh"
```

Open `vnc://127.0.0.1:5901` in a VNC viewer on the laptop, such as Remmina,
TigerVNC or macOS Screen Sharing, and enter the printed password. A pass is an
Xfce desktop where you can open a terminal and run `uname -a` inside the VM.
Keep both terminals running; Ctrl+C stops the tunnel and desktop serving.
No Proxmox firewall rule or public VNC listener is needed. If the tunnel fails
with "administratively prohibited", check sshd's effective
`AllowTcpForwarding` setting; this repo's `harden-ssh` enables it.
