# Proxmox Ubuntu LXC

`create-ubuntu-lxc` creates an Ubuntu LXC directly on the Proxmox host. It is
the local equivalent of the Community Scripts Ubuntu launcher: it asks for each
value with the default filled in, shows the result before creating anything,
and does not delete or replace an existing container.

By default it uses the newest Ubuntu `standard` template in the Proxmox catalog,
which it refreshes first. Pin a release with `UBUNTU_VERSION`.

## Usage

Run it on the Proxmox host as root, from a checkout of this repository:

```bash
cd /path/to/dotfiles
./setup/proxmox/ubuntu/create-ubuntu-lxc
```

It asks for every setting below. Press Enter to keep the value in brackets, or
type `none` to clear an optional one (container ID, login user, gateway, SSH
key file). An invalid answer, a taken container ID or a missing template
storage is asked again. If the root filesystem storage is unavailable, it lists
the active ones to pick from. After the last question it prints
the full configuration and asks `Create this container? [Y/n]`.

Pass `--defaults` to skip the questions and the confirmation:

```bash
./setup/proxmox/ubuntu/create-ubuntu-lxc --defaults
```

Without a terminal the script requires `--defaults`. With `--defaults`, an
unavailable storage or taken container ID is an error.

The defaults create a stopped, unprivileged container with:

| setting | default |
|---|---:|
| Ubuntu | newest in the catalog (`latest`) |
| CT ID | next available ID |
| hostname | `ubuntu-devbox` |
| user | `root` |
| CPU | `1` core |
| RAM | `2048` MiB |
| swap | `1024` MiB |
| disk | `12` GiB |
| template storage | `local` |
| rootfs storage | `local-lvm` |
| bridge | `vmbr0` |
| IPv4 | DHCP |
| unprivileged | enabled |
| nesting | enabled |
| keyctl | enabled |
| TUN passthrough | enabled |
| SSH key file | `/root/.ssh/authorized_keys` (every key the host's root accepts) |

Edit the configuration block at the top of the script, or override values with
environment variables. An override becomes the default shown in the question,
or the value used with `--defaults`:

```bash
CT_HOSTNAME=devbox \
CPU_COUNT=8 \
RAM_MIB=16384 \
SWAP_MIB=8192 \
./setup/proxmox/ubuntu/create-ubuntu-lxc --defaults
```

## Container ID and hostname

Leave `CT_ID` empty to select the next available ID:

```bash
CT_ID=""
```

Set it to pin an ID. The script fails if that ID is already in use; it never
chooses a replacement automatically:

```bash
CT_ID=260 CT_HOSTNAME=ubuntu-devbox ./setup/proxmox/ubuntu/create-ubuntu-lxc
```

The hostname is controlled by `CT_HOSTNAME`.

## Container user

Set `CT_USERNAME` to create a non-root login user:

```bash
CT_USERNAME=jehad ./setup/proxmox/ubuntu/create-ubuntu-lxc
```

Without `--defaults`, the script asks for the login user; leave it empty for
root only. When a user is set and a terminal is attached, it asks
`Set a password for <user>? [Y/n]`, even with `--defaults`. It does not echo
the password and asks for it twice. The user receives normal sudo access, which
requires that password.

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
./setup/proxmox/ubuntu/create-ubuntu-lxc
```

The key is passed to `pct create`. It is installed for `CT_USERNAME` when that
variable is set, or for root otherwise. The script does not store a plaintext
password. Without a key, use the Proxmox console or:

```bash
pct enter <CT_ID>
```

## Ubuntu version and template

The release is controlled by `UBUNTU_VERSION` and defaults to `latest`: the
highest Ubuntu version in the catalog for `ARCH`, interim releases included.
Pin a release, such as an LTS, with:

```bash
UBUNTU_VERSION=26.04 ./setup/proxmox/ubuntu/create-ubuntu-lxc
```

The script runs `pveam update` by default, so `latest` and a pinned release
both get the newest template build. It downloads the template when it is not
already on `TEMPLATE_STORAGE`, and fails if the release is not in the catalog.
The summary before creation names the exact template. Inspect the catalog
manually with:

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
TUN=0 ./setup/proxmox/ubuntu/create-ubuntu-lxc
```

Docker inside an LXC has a larger security and compatibility surface than
Docker inside a VM. Keep the container unprivileged unless a specific workload
proves it cannot run that way.

## Lifecycle

The container is created stopped. The script never starts it unless explicitly
configured:

```bash
START_AFTER_CREATE=1 ./setup/proxmox/ubuntu/create-ubuntu-lxc
```

Normally start and enter it manually:

```bash
pct start <CT_ID>
pct enter <CT_ID>
```

This script creates the base LXC only. It does not run the dotfiles’ Ubuntu
development setup inside the guest. Once the guest is running, use the
guest setup in [`../ubuntu-lxc-devbox`](../ubuntu-lxc-devbox/README.md).

## Proxmox firewall

Run the firewall setup on the Proxmox host after creating the container:

```bash
./setup/proxmox/ubuntu/setup-firewall <CT_ID>
```

The script enables the container firewall with an incoming `DROP` policy and
an outgoing `ACCEPT` policy. It preserves the existing `net0` settings while
adding the required `firewall=1` flag. DHCP remains enabled when `net0` uses
DHCP, and IPv6 neighbor discovery remains enabled. It does not open SSH on the
container's LAN address.

The Datacenter firewall must already be enabled. The script refuses to enable
that cluster-wide switch because it can block access to the Proxmox web UI and
host SSH. Configure host management rules first, then enable it with the web UI
or:

```bash
pvesh set /cluster/firewall/options --enable 1
```

Tailscale normally works through an incoming `DROP` policy without an explicit
inbound rule. If `tailscale status` shows relayed connections and direct
connections matter, allow the UDP port used by `tailscaled`:

```bash
TAILSCALE_DIRECT_PORT=41641 \
./setup/proxmox/ubuntu/setup-firewall <CT_ID>
```

The script identifies its Tailscale rule by comment. Rerunning it updates the
port instead of adding another rule. Running it without
`TAILSCALE_DIRECT_PORT` removes a rule previously managed by the script.
Tailnet service access remains controlled by Tailscale grants because the
Proxmox firewall sees only the encrypted transport on `net0`.

## Sources

The original interactive launcher is the [Community Scripts Ubuntu
script](https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/ubuntu.sh).
It delegates most behavior to the [Community Scripts core
engine](https://raw.githubusercontent.com/community-scripts/core/main/pve/backend.func).
This local script keeps the useful Proxmox concepts—Ubuntu standard templates,
`pct create`, LXC features, and SSH key injection—but owns the configuration and
failure behavior instead of sourcing the upstream `main` branch at runtime.
