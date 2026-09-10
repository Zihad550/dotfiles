# Proxmox Ubuntu LXC

`create-ubuntu-lxc` creates an Ubuntu LXC directly on the Proxmox host. It is
the deterministic local equivalent of the Community Scripts Ubuntu launcher:
it does not display menus, does not choose another Ubuntu release silently, and
does not delete or replace an existing container.

The default Ubuntu release is **26.04**. The script requires an exact matching
template in the Proxmox catalog.

## Usage

Run it on the Proxmox host as root, from a checkout of this repository:

```bash
cd /path/to/dotfiles
./setup/proxmox/create-ubuntu-lxc
```

The default configuration creates a stopped, unprivileged container with:

| setting | default |
|---|---:|
| Ubuntu | `26.04` |
| CT ID | next available ID |
| hostname | `ubuntu-devbox` |
| user | `root` |
| CPU | `1` core |
| RAM | `1024` MiB |
| swap | `2048` MiB |
| disk | `6` GiB |
| template storage | `local` |
| rootfs storage | `local-lvm` |
| bridge | `vmbr0` |
| IPv4 | DHCP |
| unprivileged | enabled |
| nesting | enabled |
| keyctl | enabled |
| TUN passthrough | enabled |

Edit the configuration block at the top of the script, or override values for
one run:

```bash
CT_HOSTNAME=devbox \
CPU_COUNT=8 \
RAM_MIB=16384 \
SWAP_MIB=8192 \
./setup/proxmox/create-ubuntu-lxc
```

## Container ID and hostname

Leave `CT_ID` empty to select the next available ID:

```bash
CT_ID=""
```

Set it to pin an ID. The script fails if that ID is already in use; it never
chooses a replacement automatically:

```bash
CT_ID=260 CT_HOSTNAME=ubuntu-devbox ./setup/proxmox/create-ubuntu-lxc
```

The hostname is controlled by `CT_HOSTNAME`.

## Container user

Set `CT_USERNAME` to create a non-root login user:

```bash
CT_USERNAME=jehad ./setup/proxmox/create-ubuntu-lxc
```

The script asks whether to set a password when run from a terminal. It does not
echo the password and asks for confirmation before creating the container. The
user receives normal sudo access, which requires that password.

If you decline or run the script without a terminal, the user has no password.
SSH key login still works, but sudo will not work until root sets a password:

```bash
pct exec <CT_ID> -- passwd <username>
```

If `SSH_AUTHORIZED_KEY_FILE` is set, the script installs that key for the new
user and removes it from root. The root account remains available through the
Proxmox console and `pct enter`.

Leave `CT_USERNAME` empty to create no additional user. In that case, root is
the only login user and receives the SSH authorized key.

## SSH authorized key

Set `SSH_AUTHORIZED_KEY_FILE` to a public-key file on the Proxmox host:

```bash
SSH_AUTHORIZED_KEY_FILE=/root/.ssh/id_ed25519.pub \
./setup/proxmox/create-ubuntu-lxc
```

The key is passed to `pct create`. It is installed for `CT_USERNAME` when that
variable is set, or for root otherwise. The script does not store a plaintext
password. Without a key, use the Proxmox console or:

```bash
pct enter <CT_ID>
```

## Ubuntu version and template

The release is controlled by `UBUNTU_VERSION` and defaults to `26.04`:

```bash
UBUNTU_VERSION=26.04 ./setup/proxmox/create-ubuntu-lxc
```

The script runs `pveam update` by default, searches for an exact Ubuntu
`standard` template, downloads it when necessary, and fails if that release is
not available. Inspect the catalog manually with:

```bash
pveam available --section system | grep ubuntu
```

Set `UPDATE_TEMPLATE_CATALOG=0` to use the existing catalog without refreshing
it.

## Docker and Tailscale features

The defaults enable the LXC features needed by the intended development box:

```bash
NESTING=1
KEYCTL=1
TUN=1
```

`TUN=1` passes `/dev/net/tun` through for Tailscale. Disable it if this LXC
does not need Tailscale:

```bash
TUN=0 ./setup/proxmox/create-ubuntu-lxc
```

Docker inside an LXC has a larger security and compatibility surface than
Docker inside a VM. Keep the container unprivileged unless a specific workload
proves it cannot run that way.

## Lifecycle

The container is created stopped. The script never starts it unless explicitly
configured:

```bash
START_AFTER_CREATE=1 ./setup/proxmox/create-ubuntu-lxc
```

Normally start and enter it manually:

```bash
pct start <CT_ID>
pct enter <CT_ID>
```

This script creates the base LXC only. It does not run the dotfiles’ Ubuntu
development setup inside the guest. Once the guest is running, use the
appropriate guest setup path and then reuse the selected devbox tools.

## Sources

The original interactive launcher is the [Community Scripts Ubuntu
script](https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/ubuntu.sh).
It delegates most behavior to the [Community Scripts core
engine](https://raw.githubusercontent.com/community-scripts/core/main/pve/backend.func).
This local script keeps the useful Proxmox concepts—Ubuntu standard templates,
`pct create`, LXC features, and SSH key injection—but owns the configuration and
failure behavior instead of sourcing the upstream `main` branch at runtime.
