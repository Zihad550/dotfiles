# ubuntu-devbox

Bare-metal Ubuntu Server 26 desktop used as a dev box over ssh, reached through
Tailscale. Same package set as [`setup/devcontainer`](../devcontainer), plus the
things a container got for free from its host: networking, firewall, disks.

## order

```bash
setup/boot.sh ubuntu-devbox           # or: setup/ubuntu-devbox/init
LAN_SSH_SRC=192.168.0.1 setup/ubuntu-devbox/setup-ufw
setup/ubuntu-devbox/setup-tailscale
setup/ubuntu-devbox/harden-ssh        # after ssh-copy-id from the laptop
```

`setup-ufw` goes before `setup-tailscale`. Ubuntu ships ufw installed but
**inactive**, so until it runs sshd is open to every host on the LAN — closing
that window first is worth more than seeing `tailscale0` in `ufw status`. Nothing
is lost by going first: `ufw allow in on tailscale0` names an interface that need
not exist yet and starts matching the moment tailscaled brings it up, and
`tailscale up` only needs outbound, which ufw allows by default.

The one thing this ordering costs is `LAN_SSH_SRC=none` — with no tailnet joined
yet it would leave no way in at all, so `setup-ufw` now refuses it until
`tailscale status` reports a joined node. Run the two in the other order if you
want a tailnet-only box.

`harden-ssh` goes last on purpose: it mirrors the break-glass rule `setup-ufw`
created onto the new port, and it refuses to run until `~/.ssh/authorized_keys`
has a key in it.

Then, independently of each other and in any order:

```bash
setup/ubuntu-devbox/encrypt-data-disk /dev/sdb1   # LUKS on a data disk
setup/ubuntu-devbox/setup-root-autounlock         # unattended boot, encrypted root only
```

Neither of those two depends on the other — they act on **different disks**.
`encrypt-data-disk` creates a LUKS volume on a disk you name and enrolls *that*
disk into the TPM itself. `setup-root-autounlock` never formats anything; it
finds the root LUKS device the installer created and adds a TPM keyslot to it.
Run one, both, or neither.

The reason they are not one script: a data disk is unlocked by
`systemd-cryptsetup` once userspace is up, where failure just means `/data` is
missing. Root is unlocked in the initramfs, which needs `update-initramfs` and a
`cryptsetup-initramfs` that ships the TPM2 token plugin — the part that has to
be verified with an on-console reboot.

| script | what it does |
|---|---|
| `init` | entrypoint; runs `packages`, `setup-docker`, `stow`, `tools`, sets zsh |
| `packages` | apt + mise/neovim PPAs — same list as the devcontainer |
| `setup-docker` | Docker CE + `docker` group — the devcontainer's docker-in-docker feature |
| `tools` | global mise toolchain — copy of `devcontainer/tools` |
| `stow` | dotfile symlinks — `devcontainer/stow` plus the bind-mounted paths it assumed |
| `setup-tailscale` | install tailscale, join the tailnet, enable Tailscale SSH |
| `setup-ufw` | deny all in; allow the tailnet, plus ssh from `$LAN_SSH_SRC` |
| `harden-ssh` | key-only sshd, no root, random high port, modern crypto only |
| `encrypt-data-disk` | LUKS2 on a **data** disk, auto-unlocked via TPM2 |
| `setup-root-autounlock` | unattended boot for an already-encrypted **root** |

## root disk encryption is an installer choice

Nothing here can retrofit it. Full-disk encryption for `/` has to be selected
during the Ubuntu Server install, in the storage step:

> **Use an entire disk** → **Set up this disk as an LVM group** →
> **Encrypt the LVM group with LUKS**

Pick a passphrase you can type at a physical keyboard, and keep it — TPM2
enrollment later is an *addition*, never a replacement.

If you already installed without it, the honest answer is reinstall. Otherwise
put your work on an `encrypt-data-disk` volume and accept that the OS itself is
in the clear.

## headless boot

An encrypted root prompts for its passphrase in the initramfs. Tailscale is not
running that early, so a headless box is unreachable until someone types it —
every reboot, including unattended ones after a kernel update.

`setup-root-autounlock` fixes that by sealing the key to the TPM (PCR 7, the secure
boot policy). The box then boots on its own and you can ssh straight in.

What that buys and what it doesn't:

- **protects** a drive pulled from the machine, or the machine decommissioned/RMA'd
- **protects** against booting other media or disabling secure boot — that changes
  PCR 7 and the seal fails closed
- **does not protect** a machine stolen intact and powered on; it unlocks itself

Run it with a keyboard attached and reboot to verify before trusting it. The
passphrase keyslot stays enrolled, and the script offers a separate recovery key
— TPM state changes (firmware update, secure boot toggle, board swap) will
invalidate the seal, and that keyslot is the way back in.

The alternative, `dropbear-initramfs`, puts an ssh server in the initramfs so you
can unlock remotely. It only works from the LAN — not over Tailscale — so for a
box reached from outside it does not solve the actual problem.

## tailscale ssh

`setup-tailscale` enables `tailscale up --ssh` by default: tailnet identity and
ACLs replace `~/.ssh/authorized_keys` for connections over the tailnet, and
nothing is exposed off it. Set `TS_SSH=0` to keep plain sshd only.

**It does nothing until the tailnet ACL grants it.** `tailscale up --ssh` joins
successfully and then refuses every connection — a silent failure. Add this at
<https://login.tailscale.com/admin/acls>:

```json
"ssh": [
  {
    "action": "accept",
    "src":    ["autogroup:member"],
    "dst":    ["autogroup:self"],
    "users":  ["autogroup:nonroot", "jehad"]
  }
]
```

### keep sshd too, LAN-only

Tailscale SSH is the primary path; sshd stays as the recovery path. `tailscaled`
*becomes* the ssh server for tailnet traffic, so a failed upgrade or a bad ACL
edit takes ssh with it — and the fix is then only reachable from the LAN or a
physical keyboard.

Disabling sshd would buy very little here: ufw already denies everything except
`192.168.0.0/24`, so it is not reachable from the internet either way. The one
thing that flips this is an **untrusted LAN** (shared flat, chatty IoT devices).
Then go Tailscale-only and treat the physical console as the recovery path:

```bash
sudo systemctl disable --now ssh
```

### firewall

Use this directory's [`setup-ufw`](setup-ufw), not
[`../ubuntu-server/setup-ufw`](../ubuntu-server/setup-ufw). The latter opens
5173/3000/3500/9000/8000 to the whole `/24`, which is redundant surface once dev
servers are reachable over the tailnet — and it allows OpenSSH from
`192.168.0.0/24` only, dropping ssh that arrives on `tailscale0` from
`100.64.0.0/10`.

The devbox version opens `tailscale0` wholesale (so a new app on any port needs
no firewall change) and gives the LAN exactly one hole: ssh, as break-glass. It
asks which:

```
How should this machine be reachable over the LAN?

  1) one machine only  -- most restrictive, needs a DHCP reservation
  2) the whole subnet  -- 192.168.0.0/24
  3) no LAN access     -- tailnet only; a keyboard attached to this
                          machine becomes the only recovery path
```

Option 2 shows the subnet this machine is actually on, detected from `ip route`.
If you are connected over ssh it offers that client address as the default for
option 1 — and if you are connected over the *tailnet* it says so and refuses to
offer the `100.x` address, which would build a rule that never matches.

Narrowing to a single host is worth it — ~254 potential LAN hosts down to one —
but **give that machine a DHCP reservation first**. The LAN rule exists for when
`tailscaled` is what broke; if it points at an address your router can reassign,
it is not a recovery path. Source-IP rules are also not a strong boundary on a
LAN (ARP spoofing defeats them); this is defense in depth against a compromised
device on the network, not a security border.

For unattended runs, `LAN_SSH_SRC` skips the prompt:

```bash
LAN_SSH_SRC=192.168.0.1 setup/ubuntu-devbox/setup-ufw
LAN_SSH_SRC=none         setup/ubuntu-devbox/setup-ufw   # only once the tailnet is up
```

`none` exits non-zero unless `tailscale status` reports a joined node — in the
default order the tailnet does not exist yet, and a box with neither a LAN rule
nor a tailnet needs a keyboard plugged into it.

### zed remote

Zed's remote development shells out to the local `ssh` binary and keeps one
ControlMaster per project. Every feature it needs is supported by Tailscale SSH:
standard ssh clients work (netstack interception + auto-managed `known_hosts`),
ControlMaster multiplexing was fixed in tailscale/tailscale#4946, `-N` port
forwarding in #5865, and SFTP is embedded in `tailscaled`. Zed also downloads its
server binary on the remote by default, so no file transfer is involved at all.

Confirm the plumbing before opening Zed:

```bash
ssh jehad@devbox        # from the laptop, no key setup needed
```

## sshd hardening

[`harden-ssh`](harden-ssh) writes a single drop-in,
`/etc/ssh/sshd_config.d/00-harden.conf`, and nothing else — `--revert` deletes it
and you are back to the distro config.

```bash
./harden-ssh                 # random port in 20000-59999
SSH_PORT=48222 ./harden-ssh  # pin it
SSH_PORT=keep  ./harden-ssh  # auth + crypto only, stay on 22
./harden-ssh --finalize      # phase 2: stop listening on 22
./harden-ssh --revert
```

What it sets: `PasswordAuthentication no`, `AuthenticationMethods publickey`,
`PermitRootLogin no`, `AllowUsers $USER`, `MaxAuthTries 3`, `LoginGraceTime 20`,
no X11 forwarding, no tunnels, no user rc/environment, `LogLevel VERBOSE`, and
`UseDNS no`.

### crypto is left at the defaults

No `KexAlgorithms` / `Ciphers` / `MACs` / `HostKeyAlgorithms` /
`PubkeyAcceptedAlgorithms` / `HostKey` lines, on purpose. OpenSSH's defaults
already exclude everything broken — SHA-1 RSA signatures since 8.8, DSA since
9.8, CBC modes and `group1-sha1` absent from the default proposal — and they
follow upstream. A hand-pinned list does not: `mlkem768x25519-sha256` only
arrived in 9.9, so a list written a year earlier would still be excluding the
best available key exchange while looking hardened.

The trade, stated plainly: `diffie-hellman-group-exchange-sha256` stays
negotiable, so `/etc/ssh/moduli` is read and a scanner may flag entries under
3072 bits (`awk '$1 ~ /^#/ || $5 >= 3071' /etc/ssh/moduli` is the prune).
Post-quantum key exchange is preferred but not required, and ecdsa host and user
keys remain acceptable. None of that is reachable from the internet here anyway —
ufw allows only the tailnet and one LAN source — and the lines carrying the real
weight are `PasswordAuthentication no` and `PermitRootLogin no`.

Two deviations from the usual hardening list, both deliberate:
`AllowTcpForwarding yes` (Zed remote opens `ssh -N` forwards, and `GatewayPorts
no` keeps them on loopback) and `AllowAgentForwarding yes` (so `git push` from
the devbox uses the laptop's key rather than a second key to revoke separately —
the cost is that root on the devbox can use your agent while you are attached).

### why 00- and not 99-

sshd is **first-match-wins** for most keywords, and `Include
/etc/ssh/sshd_config.d/*.conf` sits at the *top* of `sshd_config`. So the
alphabetically first drop-in wins — over the main file and over
`50-cloud-init.conf`, which is the thing that otherwise puts
`PasswordAuthentication yes` back on an autoinstall image. A `99-` file would
lose that argument silently.

### the port move is a systemd change, not an sshd one

Ubuntu 22.10+ ships ssh socket-activated. systemd owns the listening socket and
`Port` in `sshd_config` is **ignored** — edit it and sshd restarts happily, still
on 22. `harden-ssh` detects this (`systemctl is-enabled ssh.socket`) and writes
`/etc/systemd/system/ssh.socket.d/00-harden.conf` instead. The empty
`ListenStream=` there matters: without it a drop-in only *adds* a port and 22
stays open forever.

Tailscale SSH is untouched by all of this. `tailscaled` is its own ssh server for
tailnet traffic and never reads `sshd_config`, so `ssh devbox` over the tailnet
keeps working on 22 regardless of the port sshd moved to.

### two phases

A config that locks you out is indistinguishable from one that works until you
try it. So phase 1 leaves sshd listening on **both** 22 and the new port, with
ufw rules for both, and your current session survives whatever happens. Phase 2
(`--finalize`) removes 22 from sshd and deletes the port-22 ufw rules — run it
from a session you opened on the new port.

An interactive run offers phase 2 once you confirm the new port works. A
non-interactive one never does; `HARDEN_SSH_ASSUME_YES=1` forces it, and that is
the one way this script can strand a headless box.

### what the random port is and isn't

It is not a security boundary — ufw already denies everything except the tailnet
and one LAN source, so nothing on the internet can reach any port. What it buys
is quiet: no credential-stuffing noise in the journal from whatever else is on
the LAN, and no `22/tcp open` on a casual scan.

The cost is that the port is now something you have to know. `harden-ssh` prints
the `~/.ssh/config` block to paste on the laptop; `awk '$1=="Port"'
/etc/ssh/sshd_config.d/00-harden.conf` on the box is the answer if you lose it.

### fail2ban

Not installed, deliberately. It can only ban addresses that can reach sshd, and
after `setup-ufw` those are your own LAN host and your own tailnet — so the jail
would sit at zero bans forever while adding a way to lock yourself out. It
becomes worth revisiting only if sshd is ever exposed beyond the tailnet, which
this setup never does.

## exposing dev servers over tailscale

Yes — this replaces ssh port forwarding entirely. `setup-tailscale` runs
`ufw allow in on tailscale0`, which opens **every** port to the tailnet, so a dev
server on the devbox is reachable at `http://devbox:5173` from the laptop with no
per-port firewall rule and no tunnel.

Two Vite defaults will bite first, and both look like network problems:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    host: true,                    // else it binds 127.0.0.1 and the tailnet sees nothing
    allowedHosts: [".ts.net", "devbox"],  // else "Blocked request. This host is not allowed."
  },
});
```

`allowedHosts` is the one people lose time on: Vite 5.4.12+/6.x rejects Host
headers it does not recognise (CVE-2025-31125 hardening), so it fails *after* the
connection succeeds.

For browser APIs that require a secure context (camera, clipboard, service
workers), put a real HTTPS cert in front instead of self-signing:

```bash
tailscale serve --bg 5173     # https://devbox.<tailnet>.ts.net
tailscale serve status
```

Unattended join:

```bash
TS_AUTHKEY=tskey-auth-... TS_HOSTNAME=devbox ./setup-tailscale
```
