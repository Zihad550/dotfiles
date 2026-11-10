# Shared setup

`setup/common/` owns setup behavior shared by the box directories in this
repository and by the Arch desktop installers in
[arch-desktop](https://github.com/Zihad550/arch-desktop), which call these
scripts through its `portable/` link. A script stays here when it is intended to
be reusable, even if only one box calls it today. The box wrappers own
distro-specific installation, values, ordering, and local rationale.

The scripts are authoritative for supported inputs and defaults. This README
explains why the shared behavior has its current shape. Script comments point
here when the explanation does not belong beside the command it protects.
Arch-only shared scripts live in arch-desktop's `setup/common/`.

## Inventory

### Shared Setup Scripts

| Component | Purpose | Current callers |
| --- | --- | --- |
| [`check-machine-profile`](check-machine-profile) | Stops a setup whose target differs from the recorded machine profile. | Both `boot.sh`, Arch Workstation, Arch devbox, Ubuntu LXC devbox |
| [`harden-ssh`](harden-ssh) | Hardens sshd and performs its two-phase port change. | Arch and Ubuntu wrappers |
| [`hw-detect`](hw-detect) | Supplies hardware predicates to setup entry points. | Arch Workstation, Arch devbox, Ubuntu devbox |
| [`set-dotfiles-profile`](set-dotfiles-profile) | Persists the setup target for desktop and shell consumers. | Arch Workstation, Arch devbox, Ubuntu LXC devbox |
| [`setup-dns`](setup-dns) | Configures default DNS and disables Tailscale DNS takeover. | Arch devbox, Arch Workstation, Ubuntu LXC devbox |
| [`setup-herdr`](setup-herdr) | Installs Herdr and its agent integrations. | Arch devbox, Ubuntu devbox, Ubuntu LXC devbox, Ubuntu server |
| [`setup-herdr-integrations`](setup-herdr-integrations) | Installs or refreshes Herdr integrations for the agents present. | `setup-herdr`, `df-update-daily` |
| [`setup-no-sleep`](setup-no-sleep) | Keeps a box reachable by blocking every configured suspend path. | Arch and Ubuntu devboxes |
| [`setup-skills`](setup-skills) | Installs the shared agent skill set. | Arch devbox, Ubuntu, and shell-layer VM setup |
| [`setup-tailscale`](setup-tailscale) | Joins a box to the tailnet after its wrapper installs Tailscale. | Arch and Ubuntu wrappers |
| [`setup-tuned`](setup-tuned) | Installs the always-on bare-metal power profile. | Arch and Ubuntu wrappers |

### Support and package input

- [`ufw-lib`](ufw-lib) is sourced by the firewall scripts and `harden-ssh`. It
  centralizes address validation, subnet detection, rule deletion, and UFW
  startup.
- [`10-dns-override.conf`](10-dns-override.conf) is the devbox resolver
  policy, used by the Arch devbox and Ubuntu LXC devbox `setup-dns` wrappers.
  [`networkmanager-dns.conf`](networkmanager-dns.conf) points NetworkManager
  at systemd-resolved and leaves `tailscale0` unmanaged.
- [`packages/mise-dev-packages`](packages/mise-dev-packages) installs the
  mise-managed language runtimes for a dev box. Callers: Arch devbox, Ubuntu
  devbox, Ubuntu LXC devbox, Ubuntu server.

## Machine profile

The Arch installers and `ubuntu-lxc-devbox` write their target name to
`~/.config/uwsm/env.d/10-dotfiles-profile` after every required setup step has
succeeded. On `ubuntu-lxc-devbox`, a partial `tools` failure (exit 1) is not a
required step: `init` still records the profile and prints which tools to retry.
UWSM loads `DOTFILES_PROFILE` before Hyprland and its user services.
`.zshenv` sources the same file for shells that start outside the graphical
session, including SSH sessions; on the headless Ubuntu box that is the only
reader.

`DOTFILES_PROFILE` has one value: `arch-workstation`, `arch-devbox` or
`ubuntu-lxc-devbox`. The backup and web-app commands (`home-backup`,
`df-webapp-install`, `df-webapp-remove`) only support the Arch values.
Consumers should compare that value instead of maintaining separate boolean
flags that could both be set.

Runtime code that differs by setup target should use an exact comparison:

```sh
case "${DOTFILES_PROFILE:-}" in
    arch-devbox) ... ;;
    arch-workstation) ... ;;
    ubuntu-lxc-devbox) ... ;;
esac
```

Code inside `setup/arch-devbox/`, `setup/arch-workstation/` or
`setup/ubuntu-lxc-devbox/` already belongs to one target and does not need this
check. The variable is for shared runtime configuration and commands.

Setup itself reads the file, not the variable, through
[`check-machine-profile`](check-machine-profile): both repositories' `boot.sh`
run it before any target, and both Arch `init`s and `ubuntu-lxc-devbox/init` run it before any
setup step. A machine that has a profile only runs the setup with the same
name; any other target stops with a message that names the machine's own setup.
Deleting the profile file lifts the stop, for a machine that really is being
repurposed. A machine set up before profiles existed has no file, so nothing
stops it.

### Existing installs

Register the profile once after pulling this change:

```sh
# Run one of these.
~/dotfiles/setup/common/set-dotfiles-profile arch-devbox
~/dotfiles/setup/common/set-dotfiles-profile arch-workstation
~/dotfiles/setup/common/set-dotfiles-profile ubuntu-lxc-devbox
```

New shells read the value immediately, which is all `ubuntu-lxc-devbox` needs.
On Arch, log out and back in once so UWSM starts Hyprland, Quickshell, and user
services with it. Confirm the result with:

```sh
printf '%s\n' "$DOTFILES_PROFILE"
```

## SSH hardening

Every Box Wrapper sets the contract documented at the top of
[`harden-ssh`](harden-ssh), then executes the same Shared Setup Script. Ubuntu
devbox keeps a LAN break-glass path and must mirror the new sshd port into UFW.
Arch permits traffic arriving on `tailscale0`, so a port change needs no new
firewall rule. Ubuntu LXC devbox has no guest firewall to update: the Proxmox
firewall drops LAN inbound, and `pct enter` on the host is its break-glass
path.

### two phases

A config that locks you out is indistinguishable from a working one until you
try it. So the port change is a Phase rollout. Phase 1 leaves sshd listening on
**both** 22 and the new port, and your current session survives whatever
happens. Phase 2 (`--finalize`) drops 22 — run it from a session you opened on
the new port. `--revert` removes the drop-ins entirely.

An interactive run offers Phase 2 once you confirm the new port works. A
non-interactive one never does. `HARDEN_SSH_ASSUME_YES=1` forces it, and that is
the one way this script can strand a headless box.

### why move the port

The auth and crypto hardening is always wanted. The port move is not, and what
it buys depends on `HARDEN_NET`.

With a LAN Break-glass path (`lan`) it is the ordinary reason: fewer unattended
login attempts from whatever else is on the wire. It is not a security boundary
— the firewall already decides what can reach sshd at all — and the cost is that
the port becomes something you have to know.

On a tailnet-only box (`tailnet`) there is no scanner to hide from, so whether
the move does anything at all turns on one Tailscale pref:

| | effect |
| --- | --- |
| `RunSSH true` | `tailscaled` intercepts port 22 on the tailnet IP, in userspace, before the packet reaches the host stack. sshd on 22 is unreachable from the only network the box answers on, so moving off 22 is what makes sshd reachable — not optional. |
| `RunSSH false` | Nothing intercepts 22 and sshd already answers there. The move buys nothing, which is why `SSH_PORT=keep` exists. |

All three boxes run `RunSSH false`. The two states are indistinguishable until one
breaks, so `harden-ssh` detects it rather than assuming, and treats undetectable
as `false` — the direction that warns harder.

Tailscale SSH is unaffected either way: `tailscaled` is its own ssh server for
tailnet traffic and never reads `sshd_config`.

## DNS and MagicDNS

`setup-dns` configures systemd-resolved as the default resolver and disables
Tailscale's automatic DNS configuration. Arch devbox uses `1.0.0.3` with strict
DNS over TLS; Arch workstation preserves router/DHCP DNS. The Ubuntu LXC
wrapper uses the devbox default as a separate manual step.

Setup adds no domain forwarding. Run `df-tailscale-dns` to enter a domain
through Gum; this saves the choice and installs persistent forwarding through
Tailscale DNS. See [DNS setup, domain forwarding and undo](https://github.com/Zihad550/arch-desktop/blob/main/docs/dns.md).

## Tailscale and sshd

The wrappers install Tailscale differently and disagree about which step owns
the `tailscale0` UFW rule. They pass that difference through
`TS_TAILNET_UFW_RULE`; the Shared Setup Script owns everything from starting
`tailscaled` onward.

All current wrappers leave `TS_SSH` at its default of `0`. Remote access is
ordinary sshd over the tailnet, authenticated by `~/.ssh/authorized_keys`.
`ufw allow in on tailscale0` makes sshd reachable. Tailscale SSH remains an
explicit `TS_SSH=1` capability, not the standard access path.

Opting in changes who owns port 22 on the tailnet address. `tailscaled`
intercepts it before the host network stack, and the tailnet ACL must contain
an `ssh` rule. A successful `tailscale up --ssh` does not prove that rule
exists. Without it, the node joins and SSH connections are refused. sshd must
move away from port 22 if it should remain reachable alongside Tailscale SSH.

## Staying awake

Three independent mechanisms can suspend a graphical box: systemd sleep
targets, logind lid handling, and the Quickshell Idle Ladder. `setup-no-sleep`
blocks all three because an always-on devbox must remain reachable.

A fourth used to be counted here — the Greeter's own power policy, which under
GDM meant a GNOME settings daemon running before login. SDDM's greeter runs no
such daemon, so the path no longer exists to block.

They all converge on systemd's sleep targets. Masking those targets is the
actual safety boundary; the logind drop-in makes the policy explicit and stops
repeated failed suspend attempts. A detached monitor can expose the lid path: a
closed laptop changes from docked to undocked, then follows `HandleLidSwitch`
instead of `HandleLidSwitchDocked`.

The devbox's `idle.json` is a one-field override of the shared timing data. Its
Suspend Stage is `null`, so Dim, Lock and Blank keep their shared timings while
manual suspend remains available and idle suspend is absent.

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

## Herdr on headless profiles

The Ubuntu devbox, Ubuntu LXC devbox, and Ubuntu server call
[`setup-herdr`](setup-herdr) directly. The shared installer gets the binary
from mise on those profiles. Arch devbox gets the binary from the shared
pacman package list, then calls the same installer for integrations and the
Herdr skill. The install stays non-interactive. Their stow scripts link only
`herdr/.config/herdr/config.toml`; session state stays on the host. The
integration list remains shared because no host evidence shows
that a lean server-only list is needed. The owner verified Herdr's session,
detach/reattach, and prefix-key workflow on all three target profiles. See
[ADR 0029](https://github.com/Zihad550/arch-desktop/blob/main/docs/adr/0029-headless-profiles-use-herdr.md).

## Hardware detection

Setup entry points source `hw-detect`; they do not execute it. The unused CPU
and GPU predicates remain here because this file is the shared hardware-query
boundary, not because every predicate must have a current caller.
