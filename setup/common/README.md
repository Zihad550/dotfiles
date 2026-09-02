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
| [`hw-detect`](hw-detect) | Supplies hardware predicates to setup entry points. | Arch Workstation, Arch devbox, Ubuntu devbox |
| [`setup-dirmngr`](setup-dirmngr) | Configures GnuPG DNS resolution before key retrieval. | Arch devbox |
| [`setup-dns`](setup-dns) | Writes a systemd-resolved DNS override without breaking MagicDNS. | Arch wrapper |
| [`setup-first-run-sudo`](setup-first-run-sudo) | Installs and removes the temporary passwordless-sudo drop-in used during setup. | Arch Workstation, Arch devbox |
| [`setup-greeter`](setup-greeter) | Installs and enables the pinned Greeter, retiring the display manager it replaces. | Arch Workstation, Arch devbox |
| [`setup-idle-ladder`](setup-idle-ladder) | Selects per-box Idle Ladder timing data outside the stow tree. | Arch Workstation, Arch devbox |
| [`setup-herdr`](setup-herdr) | Installs Herdr and its agent integrations. | Arch devbox, Ubuntu devbox, Ubuntu server, Alpine |
| [`setup-no-sleep`](setup-no-sleep) | Keeps a box reachable by blocking every configured suspend path. | Arch and Ubuntu devboxes |
| [`setup-rootless-docker`](setup-rootless-docker) | Replaces rootful Docker with a per-user daemon. | Arch Workstation and Arch devbox |
| [`setup-skills`](setup-skills) | Installs the shared agent skill set. | Arch, Ubuntu, and devcontainer setup |
| [`setup-snapper`](setup-snapper) | Applies the root filesystem snapshot-retention policy. | Arch devbox |
| [`setup-tailscale`](setup-tailscale) | Joins a box to the tailnet after its wrapper installs Tailscale. | Arch and Ubuntu wrappers |
| [`setup-ts-serve`](setup-ts-serve) | Grants passwordless `ts-serve` through a validating root wrapper. | Arch Workstation, Arch devbox |
| [`setup-tuned`](setup-tuned) | Installs the always-on bare-metal power profile. | Arch and Ubuntu wrappers |

### Support and package input

- [`ufw-lib`](ufw-lib) is sourced by the firewall scripts and `harden-ssh`. It
  centralizes address validation, subnet detection, rule deletion, and UFW
  startup.
- [`packages/`](packages) holds executable package-command lists, not Shared
  Setup Scripts. A list lands here once more than one box runs it, on the same
  rule as the scripts above — otherwise it stays in the Box Wrapper that owns
  it (`arch-workstation/packages/pacman-apps` is that box's app layer, and
  `arch-devbox` keeps its own copy).

  | List | Installs | Current callers |
  | --- | --- | --- |
  | [`pacman-base`](packages/pacman-base) | The CLI toolkit, fonts, coreutils replacements and gcc. | Arch Workstation, Arch devbox |
  | [`yay-packages`](packages/yay-packages) | AUR packages. | Arch Workstation, Arch devbox |
  | [`flatpak-packages`](packages/flatpak-packages) | Flatpak applications. | Arch Workstation (Arch devbox keeps it off) |
  | [`go-packages`](packages/go-packages) | Go tools installed with `go install`. | Arch Workstation, Arch devbox |
  | [`quickshell-packages`](packages/quickshell-packages) | The shell binary and every external program its QML shells out to. | Arch Workstation, Arch devbox |
  | [`mise-dev-packages`](packages/mise-dev-packages) | The mise-managed language runtimes for a dev box. | Arch devbox |

## Boot Branding

`boot-branding` installs the pinned Plymouth theme and keeps it aligned with
the pinned SDDM theme. It adds Plymouth to the configured initramfs hook chain
and adds `splash` to GRUB. If the host has `/etc/kernel/cmdline`, the same
arguments are written there because `mkinitcpio` uses that file when building a
UKI. The command-line update also adds `initramfs_async=0`, matching Omarchy's
Plymouth workaround for asynchronous UKI unpacking.

## SSH hardening

Both Box Wrappers set the contract documented at the top of
[`harden-ssh`](harden-ssh), then execute the same Shared Setup Script. Ubuntu keeps
a LAN break-glass path and must mirror the new sshd port into UFW. Arch permits
traffic arriving on `tailscale0`, so a port change needs no new firewall rule.

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

Both boxes run `RunSSH false`. The two states are indistinguishable until one
breaks, so `harden-ssh` detects it rather than assuming, and treats undetectable
as `false` — the direction that warns harder.

Tailscale SSH is unaffected either way: `tailscaled` is its own ssh server for
tailnet traffic and never reads `sshd_config`.

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

## First-run sudo

A full install runs for longer than sudo's timestamp lifetime, so without help
it stops partway through to ask for a password again — sometimes behind the live
log panel, where the prompt is invisible. `setup-first-run-sudo` writes a
drop-in granting passwordless `systemctl`, `ufw`, `snapper` and `modprobe`, and
the init's exit trap calls it again with `--remove`.

Those grants are broad; `systemctl` alone is close to root-equivalent. That is
tolerable only because the file is temporary, which makes its removal the part
that matters. Two things protect it. The drop-in permits exactly one cleanup
command, `rm -f` on its own path, so the teardown never needs a password — which
is why `--remove` must spell that command identically. And the file is syntax
checked with `visudo -c` before installation, because a malformed drop-in breaks
every subsequent sudo, including the one that would delete it.

It is not the place to add a command merely to silence one prompt. A step that
sudoes once or twice should let sudo's ordinary credential cache cover it; see
"Serving dev ports" for what widening this list actually costs.

## Serving dev ports

`ts-serve` (in `zsh/.config/zsh/aliasrc`) publishes a local dev port on the
tailnet. `tailscale serve` needs the tailscaled local API, which means root.

The obvious grant is `tailscale set --operator=$USER`, but that is a daemon-wide
pref: it hands the user the whole local API, so `tailscale up`, `down` and `set`
also stop needing root. A sudoers rule on `tailscale serve *` is narrower and
still too wide — every `serve` subcommand comes with it, including serving a
filesystem path off this box.

So the rule points at `/usr/local/bin/ts-serve-helper` instead. The helper takes
a port and an optional scheme, rejects surplus arguments and everything that is
not a port number or `http`/`https`, and composes the tailscale command itself;
the caller never supplies a URL or a flag. It is root-owned, so the user who
benefits from the rule cannot widen it by editing the helper.

The port glob in the sudoers file is not load-bearing. A sudoers `*` matches
whitespace and much more than a digit string, so it is a coarse prefilter — the
helper is the boundary that actually validates. The username interpolated into
the rule is checked for the same reason: `visudo -c` rejects a malformed file,
not a well-formed line someone smuggled in through `TS_SERVE_USER`.

The serve runs in the foreground, so Ctrl+C is the teardown and the rule never
has to permit `tailscale serve off`. A serve whose terminal is SIGKILLed can
outlive it; clear that with `sudo tailscale serve reset`.

Both wrappers install it during setup. It is inert on a box without tailscale.

Whether `tailscale serve` needs root at all is a per-box fact, not a documented
constant: Tailscale's own examples run it unprivileged, which holds once
`OperatorUser` is set. On these boxes it is unset, and `tailscale serve` fails
with `Access denied: serve config denied`. `tailscale serve status` succeeds
unprivileged either way — the socket is world-readable — so it does not answer
the question.

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

## Greeter

`setup-greeter` installs SDDM and removes the GDM these boxes used to run. It
first installs and rebuilds the pinned Omarchy Plymouth theme through the
repository's existing GRUB and `mkinitcpio` configuration, then installs the
SDDM theme, its minimal Wayland compositor config, and the Qt6 runtime pieces
that load them. The vendored sources and their upstream pins live in
[`greeter/`](greeter) and [`boot-branding/`](boot-branding), so setup is
independent of the ignored `resources/omarchy` checkout.

Boot setup rejects an unknown hook family or missing GRUB configuration before
changing live files. It preserves existing hooks and kernel arguments, keeps a
timestamped backup under `/var/lib/dotfiles/greeter-backups/`, and rolls back
when either boot rebuild fails. `df-boot-branding-set` accepts six-digit RGB
colors and a regular PNG logo, synchronizes Plymouth and SDDM, and rebuilds the
boot artifacts. `df-boot-branding-reset` restores both pinned defaults.

The order inside it is load-bearing: both units claim the
`display-manager.service` alias, so gdm is disabled before sddm is enabled —
and sddm is enabled before gdm is removed, so a failure in between leaves a
box that still boots. The enable is forced and the removal is non-fatal for the
same reason: every state a half-finished run can leave behind has to be
repairable by running it again.

The Greeter does not own the Desktop Keyring. The setup removes SDDM's
`pam_gnome_keyring` auth and password hooks, while the session creates a
passwordless default keyring and `gcr-ssh-agent.service` serves SSH keys after
login. Existing keyring files are preserved on reruns; the boundary is recorded
in [ADR 0022](../../docs/adr/0022-sddm-does-not-own-the-desktop-keyring.md).

The Greeter is password-only and remembers one account. `GREETER_USER` selects
that account explicitly. Without it, setup uses a non-root `SUDO_USER`, then
the invoking non-root account. It refuses root, missing accounts, and an
ambiguous multi-user system. It writes the selected account and
the selected Omarchy-compatible session to SDDM's state, then enables the managed autologin drop-in
when `/etc/crypttab` contains a non-comment entry or the running root is
encrypted. The latter covers `cryptdevice=` and `rd.luks.*` initramfs boots.
An absent or empty crypttab on an unencrypted-root machine removes that
drop-in without touching other SDDM configuration.

This policy runs after the Boot Branding rebuild and Greeter files install. It
does not add Omarchy's first-owner or one-shot provisioning.

The system authentication lockout policy runs after the Greeter installs its
PAM files. It applies ten failed attempts and a 120-second unlock window to
`system-auth` and SDDM's autologin stack, which covers TTY login and sudo while
keeping the Session Lock's tally and service separate. It preserves unrelated
`faillock.conf` settings and keeps timestamped recovery copies under
`/var/lib/dotfiles/auth-backups/`. The policy is recorded in [ADR 0026](../../docs/adr/0026-system-auth-lockout-policy.md).

`df-greeter-refresh` reapplies the pinned files. `df-greeter-reset` removes
only this repository's SDDM overrides and returns to stock behavior; neither
command restarts SDDM or logs out the current session. The decision is recorded
in [ADR 0024](../../docs/adr/0024-pinned-omarchy-greeter.md), which supersedes
[ADR 0020](../../docs/adr/0020-greeter-stays-stock-themed.md).
The copy-paste recovery and host-only checks are in
[Greeter recovery and host verification](../../docs/greeter-recovery.md).

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

## Herdr on headless profiles

The Ubuntu devbox, Ubuntu server, and Alpine call
[`setup-herdr`](setup-herdr) directly. The shared installer gets the binary
from mise, registers the existing agent integrations, and keeps the install
non-interactive. Their stow scripts link only
`herdr/.config/herdr/config.toml`; session state stays on the host. The
integration list is shared with the Arch devbox because no host evidence shows
that a lean server-only list is needed. The owner verified Herdr's session,
detach/reattach, and prefix-key workflow on all three target profiles. See
[ADR 0029](../../docs/adr/0029-headless-profiles-use-herdr.md).

## Hardware detection

Setup entry points source `hw-detect`; they do not execute it. The unused CPU
and GPU predicates remain here because this file is the shared hardware-query
boundary, not because every predicate must have a current caller.
