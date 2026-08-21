# Shared setup

`setup/common/` owns setup behavior used across box directories. A script stays
here when it is intended to be reusable, even if only one box calls it today.
The box wrappers own distro-specific installation, values, ordering, and local
rationale.

The scripts are authoritative for supported inputs and defaults. This README
explains why the shared behavior has its current shape. Script comments point
here when the explanation does not belong beside the command it protects.

## Inventory

### Shared Setup Scripts

| Component | Purpose | Current callers |
| --- | --- | --- |
| [`harden-ssh`](harden-ssh) | Hardens sshd and performs its two-phase port change. | Arch and Ubuntu wrappers |
| [`hw-detect`](hw-detect) | Supplies hardware predicates to setup entry points. | Arch Hyprland, Arch devbox, Ubuntu devbox |
| [`setup-dirmngr`](setup-dirmngr) | Configures GnuPG DNS resolution before key retrieval. | Arch devbox |
| [`setup-dns`](setup-dns) | Writes a systemd-resolved DNS override without breaking MagicDNS. | Arch wrapper |
| [`setup-herdr`](setup-herdr) | Installs Herdr and its agent integrations. | Arch devbox |
| [`setup-hypridle-no-suspend`](setup-hypridle-no-suspend) | Removes idle-triggered suspend while leaving manual suspend available. | Arch wrapper |
| [`setup-no-sleep`](setup-no-sleep) | Keeps a box reachable by blocking every configured suspend path. | Arch and Ubuntu devboxes |
| [`setup-rootless-docker`](setup-rootless-docker) | Replaces rootful Docker with a per-user daemon. | Arch Hyprland and Arch devbox |
| [`setup-skills`](setup-skills) | Installs the shared agent skill set. | Arch, Ubuntu, and devcontainer setup |
| [`setup-snapper`](setup-snapper) | Applies the root filesystem snapshot-retention policy. | Arch devbox |
| [`setup-tailscale`](setup-tailscale) | Joins a box to the tailnet after its wrapper installs Tailscale. | Arch and Ubuntu wrappers |
| [`setup-tuned`](setup-tuned) | Installs the always-on bare-metal power profile. | Arch and Ubuntu wrappers |

### Support and package input

- [`ufw-lib`](ufw-lib) is sourced by the firewall scripts and `harden-ssh`. It
  centralizes address validation, subnet detection, rule deletion, and UFW
  startup.
- [`packages/mise-dev-packages`](packages/mise-dev-packages) is an executable
  package-command list, not a Shared Setup Script.

### Available but not currently invoked

[`setup-docker`](setup-docker) installs rootful Docker. No current setup entry
point calls it. The active Arch setup uses `setup-rootless-docker` instead.

## SSH hardening

Both Box Wrappers set the contract documented at the top of
[`harden-ssh`](harden-ssh), then execute the same Shared Setup Script. Ubuntu keeps
a LAN break-glass path and must mirror the new sshd port into UFW. Arch permits
traffic arriving on `tailscale0`, so a port change needs no new firewall rule.

The two-phase rollout and port-choice rationale are still documented in the
script pending issue #96. That issue owns removing the duplicated prose; this
README is its destination.

## DNS and MagicDNS

`setup-dns` writes one systemd-resolved drop-in rather than editing
`resolved.conf`. The file can be removed cleanly, package updates cannot
overwrite it, and each setup concern keeps its own configuration file.

Two independent paths decide which resolver answers a lookup:

- glibc follows the `hosts:` line in `/etc/nsswitch.conf`. With `resolve`
  present, it calls systemd-resolved over D-Bus and does not read
  `/etc/resolv.conf`.
- Go binaries, containers, and Tailscale's resolver probe read
  `/etc/resolv.conf`.

The dangerous state is `resolve` in NSS while another service owns
`/etc/resolv.conf`. Tailscale then selects direct DNS mode, overwrites
`/etc/resolv.conf` with `100.100.100.100`, and registers nothing with
systemd-resolved. The override's `Domains=~.` sends `*.ts.net` to the upstream
servers, which cannot answer it. Tailnet IPs continue to work while MagicDNS
names fail without an obvious error.

The preflight refuses that split state. Pointing `/etc/resolv.conf` at
systemd-resolved's stub lets Tailscale register `100.100.100.100` on
`tailscale0`. systemd-resolved then chooses the most-specific route, so the
tailnet suffix beats `~.` and both DNS sources work. `DNS_FORCE=1` is the
explicit escape hatch for a box that does not need MagicDNS.

## Tailscale and sshd

The wrappers install Tailscale differently and disagree about which step owns
the `tailscale0` UFW rule. They pass that difference through
`TS_TAILNET_UFW_RULE`; the Shared Setup Script owns everything from starting
`tailscaled` onward.

Both current wrappers leave `TS_SSH` at its default of `0`. Remote access is
ordinary sshd over the tailnet, authenticated by `~/.ssh/authorized_keys`.
`ufw allow in on tailscale0` makes sshd reachable. Tailscale SSH remains an
explicit `TS_SSH=1` capability, not the standard access path.

Opting in changes who owns port 22 on the tailnet address. `tailscaled`
intercepts it before the host network stack, and the tailnet ACL must contain
an `ssh` rule. A successful `tailscale up --ssh` does not prove that rule
exists. Without it, the node joins and SSH connections are refused. sshd must
move away from port 22 if it should remain reachable alongside Tailscale SSH.

## Staying awake

Four independent mechanisms can suspend a graphical box: systemd sleep
targets, logind lid handling, the display manager's power policy, and
Hyprland's idle daemon. `setup-no-sleep` blocks all four because an always-on
devbox must remain reachable.

They all converge on systemd's sleep targets. Masking those targets is the
actual safety boundary; the logind drop-in and display-manager settings make
the policy explicit and stop repeated failed suspend attempts. A detached
monitor can expose the lid path: a closed laptop changes from docked to
undocked, then follows `HandleLidSwitch` instead of
`HandleLidSwitchDocked`.

`setup-hypridle-no-suspend` is deliberately narrower. It removes the idle
suspend listener but leaves manual suspend available. Use it alone when a
desktop should still honor a keybind or `systemctl suspend`.

## Power management

`setup-tuned` targets always-on bare metal. Its standalone profile avoids
inheriting the upstream `powersave` profile because that profile may enable
suspend-adjacent settings that conflict with an always-reachable box. The
Shared Setup Script refuses to compete with TLP and masks
`power-profiles-daemon`, since both write the same kernel controls.

The stock `powersave` profile enables Wi-Fi power saving unconditionally,
disables CPU boost, and sets `vm.laptop_mode=5`. A child cannot cancel its
inherited script without replacing the script section, and batching disk
writes only widens the loss window on a box whose disks never spin down. The
shared profile therefore copies only the settings that fit:

- `governor=schedutil|conservative|powersave` is a fallback list. tuned uses
  the first governor the running driver offers.
- `energy_performance_preference=balance_power` controls the active-mode
  Intel and AMD pstate drivers, where the `powersave` governor is often already
  the default.
- `boost=1` keeps turbo available for compiles.
- `autosuspend=0` is a boolean that disables USB autosuspend, not a zero-second
  delay.
- SATA link power and the audio idle timeout save power without suspending the
  box or its network path.

Do not use this profile for virtual guests. A guest owns no CPU-frequency,
SATA-link, or USB power controls, so tuned's `virtual-guest` profile is the
appropriate base there.

## Firewall library

`ufw-lib` exists because five callers had copies of the same address checks,
subnet detection, numbered-rule deletion, and UFW startup sequence. Keeping
those operations together prevents a safety fix from landing in only one
firewall path. It uses Bash and `ip`; Python is unavailable when the earliest
Arch firewall step runs.

## Agent skills

`setup-skills` uses the `skills` CLI as the owner of the global skill store.
Re-running it synchronizes the declared set. Add upstream skills to the
appropriate install block; add repository-owned skills to
`github.com/Zihad550/skills` before listing them here.

## Hardware detection

Setup entry points source `hw-detect`; they do not execute it. The unused CPU
and GPU predicates remain here because this file is the shared hardware-query
boundary, not because every predicate must have a current caller.
