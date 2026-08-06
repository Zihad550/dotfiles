# arch-devbox

The [`arch-hyprland`](../arch-hyprland) desktop, stripped to web development.

Same Hyprland session, same dotfiles, same theming, same system hardening. What
changes is the app layer: **one browser (chromium), two editors (zed, neovim)**,
and none of the chat/media/notes/torrent packages.

## order

This is the canonical copy. The script headers point here rather than restating
it; the one other place it appears is what `init` prints when it finishes, which
has to be the runnable commands. Reordering means editing those two, not five.

```bash
setup/boot.sh arch-devbox              # or: setup/arch-devbox/init
setup/arch-devbox/setup-ufw-lan        # optional: ssh in from one LAN machine
setup/arch-devbox/setup-tailscale      # join the tailnet, open tailscale0
setup/arch-devbox/setup-ufw            # tailnet-only + VLAN isolation
setup/arch-devbox/harden-ssh           # after ssh-copy-id from the laptop
```

The last four are separate from `init` because they are interactive
(`setup-tailscale` prints a login URL, `setup-ufw-lan` asks for an address) and
`run_step` gives every step stdin `/dev/null`. Order matters and is enforced:
after `setup-ufw` the tailnet is the only remote way in, so it refuses to run
until `tailscaled` is up.

`setup-ufw-lan` is scaffolding, and skippable. Between `init` and
`setup-tailscale` nothing on the network can reach this box — fine if you are
sitting at its keyboard, useless if you are not. It opens ssh from one LAN
address you name; `setup-ufw` deletes that rule again as its first act. Nothing
later depends on it having run. See
[the LAN hole is temporary](#the-lan-hole-is-temporary).

Run without a terminal and without `LAN_SSH_SRC` set, it opens the **whole
detected subnet** rather than one address, on the grounds that a box nobody can
reach is the worse failure and `setup-ufw` closes the rule either way. Pass
`LAN_SSH_SRC=<addr>` when you want the narrow rule non-interactively, or
`LAN_SSH_SRC=none` for no rule at all.

`harden-ssh` goes last, and refuses to run until `~/.ssh/authorized_keys` has a
key in it — it disables password auth, and this box has no LAN hole to fall back
to. `HARDEN_SSH_NO_KEYS=1` overrides that check; on this box it means accepting
the physical keyboard as the only way in, since sshd over the tailnet is the only
remote path — there is no Tailscale SSH behind it. See
[the access model](#the-access-model-real-sshd-over-the-tailnet).

`init` leaves the firewall at **deny-all incoming** in the meantime, so the box
is never unprotected between steps. The one allow rule it writes is container
DNS, scoped to `docker0` — nothing off this machine can match it.

## what this directory actually contains

Only what differs. Everything else is used straight out of `../arch-hyprland`,
so a fix there lands on both targets.

| file | why it exists |
|---|---|
| `init` | entrypoint; the arch-hyprland run order with the culled steps removed |
| `packages/pacman-apps` | the cull — this box's app layer, the *whole* package difference from arch-hyprland |
| `post-install` | same as arch-hyprland's, but sets chromium as default browser |
| `setup-sshd` | installs openssh and **enables sshd** — Arch does not. Run by `init` and again by `setup-ufw-lan` |
| `harden-ssh` | key-only sshd, no root, off port 22 (wrapper over [`../common/harden-ssh`](../common/harden-ssh)) |
| `setup-no-sleep` | masks the sleep targets so the box stays reachable (wrapper over [`../common/setup-no-sleep`](../common/setup-no-sleep)) |
| `setup-hypridle-no-suspend` | idle behavior only, sleep targets left unmasked — manual suspend still works (wrapper over [`../common/setup-hypridle-no-suspend`](../common/setup-hypridle-no-suspend)) |
| `hypridle.conf` | devbox idle rules — lock and DPMS-off, no suspend |
| `setup-tuned` | desktop power management — the non-laptop half of `init`'s TLP branch (wrapper over [`../common/setup-tuned`](../common/setup-tuned)) |
| `setup-dns` | points this box at Cloudflare instead of a LAN-only resolver `setup-ufw`'s VLAN isolation would block (wrapper over [`../common/setup-dns`](../common/setup-dns)) |
| `setup-ufw-base` | non-interactive deny-all baseline + `ufw-docker`, run by `init` |
| `setup-ufw-lan` | step 1: a temporary ssh hole from one LAN machine, so the rest can be driven remotely |
| `setup-tailscale` | join the tailnet, open `tailscale0` in ufw (wrapper over [`../common/setup-tailscale`](../common/setup-tailscale)) |
| `setup-ufw` | step 2: allow the tailnet, delete the LAN hole, cut the box off from the rest of the VLAN |

Borrowed unchanged from `../arch-hyprland`: `utils/*`, `preflight`, `theme`,
`gnome-theme`, `keyring`, `logo.txt`, `setup-omarchy-repos`, `packages/go-packages`,
`packages/pacman-base`, `packages/quickshell-packages`
and all of `setup-packages/`.

Hardware detection is the exception: it used to be `../arch-hyprland/utils/hw-detect`
and now lives in [`../common/hw-detect`](../common/hw-detect), sourced by all
three installers. It is not arch-specific, and `../ubuntu-devbox` needs
`is_laptop` too.

Four small changes were made there so both installers can share them:

- `preflight` and `utils/logging` take the installer's name from
  `$ARCH_SETUP_NAME`, and the error screen's *Retry* re-execs `$ARCH_SETUP_INIT`
  instead of a hardcoded arch-hyprland path.
- `setup-mise` guards its `kilo completion` call. `kilo` is installed by
, which `init` never runs, so on a fresh box that line installed an
  **empty** `_kilo` completion file system-wide (the redirect created the file
  before the missing command failed, and the following `mv` then succeeded).
- `setup-ufw` guards `ufw allow syncthing` behind `ufw app info syncthing`. That
  app profile only exists once syncthing is installed, and arch-devbox drops it.

Four package files this directory used to own are gone, because they carried no
difference:

- **`packages/pacman-packages`** → split. The CLI toolkit, fonts, coreutils
  replacements and `gcc` were byte-identical to arch-hyprland's and now live once
  in [`../arch-hyprland/packages/pacman-base`](../arch-hyprland/packages/pacman-base);
  only `packages/pacman-apps` is still local. Adding a CLI tool to `pacman-base`
  now reaches both machines — which is the failure this prevents. `ubuntu-devbox`
  is a third hand-maintained copy of the same toolkit and has already drifted:
  commit `f362aa2` dropped `aichat`, `worktrunk` and `lazydocker` there only, and
  it lists `git-delta` twice.
- **`packages/yay-packages`** → deleted. Its body was `exit 0`. `yay` itself is
  still installed by `setup-packages/setup-yay`.
- **`packages/flatpak-packages`** → deleted. Every install line was commented out
  and `init` never called it; see [flatpak](#flatpak-is-off-by-default).

State lives in `~/.local/state/arch-devbox-setup/`, not the arch-hyprland dir, so
the `done-*` guards and the install log don't collide if both ever run on one box.

## what was dropped

Culled entries are left in the package files as **commented lines with a
one-word reason** — uncomment to get any of them back.

**Apps (not development):** discord, obs-studio, transmission-gtk, obsidian,
mpv, converseen, xournalpp, veracrypt, rclone, net-tools, dosfstools,
xorg-xhost, nautilus-image-converter, gnome-font-viewer, dragon-drop,
helium-browser-bin, zen-browser, and the syncthing step.

**yazi** (and `resvg`, which was only there to render svg previews inside it) —
nautilus covers file browsing. Two loose ends this leaves, both in files shared
with arch-hyprland and so deliberately not edited:

- `hypr/.config/hypr/lua/bindings/apps.lua:25` binds **SUPER+F** to
  `df-launch-tui yazi`. That keybinding is now dead — rebind or ignore it.
- `scripts/stow/stow-base` still runs `stow yazi`, which just leaves config
  behind for a program that isn't installed. Harmless.

`7zip` stays; it's useful on its own.

**Kept even though it isn't "web dev":** the whole Hyprland layer (uwsm,
quickshell, hyprlock, hypridle, hyprpolkitagent, the portal,
hyprsunset, swaybg, brightnessctl, pavucontrol, nwg-look), ghostty, fonts,
screenshots (swappy/slurp/grim), nautilus, gnome-disk-utility, and
gdm. The desktop is unusable without them.

quickshell's own runtime dependencies (`ttf-fira-code`, `libqalculate`,
`cliphist`, `wl-clipboard`, `libnotify`, `playerctl`) are **not** in any
`pacman-*` list. They live in
[`../arch-hyprland/packages/quickshell-packages`](../arch-hyprland/packages/quickshell-packages),
which both `init`s run — the shell is byte-identical on both targets, so its
dependency list is declared once. Add a dependency there when a QML module
starts shelling out to something new.

`gnome-keyring` and `seahorse` are **not** optional: `setup-hyprland` enables
`gcr-ssh-agent.service`, which is what unlocks ssh keys on this desktop.

`stow-backgrounds` also stays. It looks cosmetic but `df-theme-set` reads
`~/.config/backgrounds/<theme>.*` and warns when a theme has no wallpaper.

### the omarchy repo is required

`worktrunk`, `opencode`, `claude-code`, `tea`, `ufw-docker` and `quickshell`
are installed with plain `pacman -S` but are not in the official Arch repos —
they come from the omarchy repo. Dropping `setup-omarchy-repos` as "not
minimal" breaks half of `pacman-base` plus the Hyprland steps.

### flatpak is off by default

The flatpak set was zen browser, Quran, MongoDB Compass and Beekeeper Studio.
The first two are replaced or non-dev; **Compass and Beekeeper are genuinely dev
tools**, and they are the one real loss in this cull. If you want a database GUI,
uncomment the `flatpak` `run_step` in `init` and add a `packages/flatpak-packages`
installing `com.mongodb.Compass` and `io.beekeeperstudio.Studio` — this box's
old copy was deleted, since every line in it was already commented out.

### webapps

`arch-hyprland/packages/webapp-packages` (ChatGPT, Figma, LinkedIn, Facebook,
Memrise, …) is not referenced here. Note it isn't referenced by arch-hyprland's
`init` either — it has always been a run-it-yourself script. Chromium installs
PWAs on demand, so there's nothing to replace.






Several CLIs need an interactive login on first run (`claude`, `opencode`,
`gemini`, `kilo`) — `init` prints a reminder at the end.

## firewall

Tailnet-only. Everything you actually use arrives on `tailscale0`; the LAN gets
no hole at all. This box sits on its own VLAN, and the firewall enforces that
boundary rather than trusting it.

It is split across three files because only the first can run during `init`:

- **`setup-ufw-base`** (run by `init`, non-interactive) — `default deny
  incoming`, `default allow outgoing`, `ufw-docker install`, plus one
  `allow in on docker0 ... port 53` rule for containers whose `resolv.conf`
  names the bridge address instead of Docker's embedded forwarder. No rule
  reachable from any network, so there is no lockout risk in enabling it
  mid-install. That DNS rule survives `setup-ufw` — "tailnet-only" is about
  what a *remote* machine can reach, and `docker0` is not one.
- **`setup-ufw-lan`** (run by hand, optional) — `setup-sshd`, then one
  `allow from <src> to any port 22` rule, commented `lan break-glass`.
- **`setup-ufw`** (run by hand, after `setup-tailscale`) — `allow in on
  tailscale0`, delete the `lan break-glass` rule, then the hardening below.

### the LAN hole is temporary

`ubuntu-devbox` opens the same rule and **keeps** it: that box is headless, on a
normal LAN, and the hole is its permanent break-glass path. Here it is
scaffolding. This box is on its own VLAN whose other occupants are exactly what
the egress rules below exist to hide from, so a standing inbound hole from it
would undo the point.

So the prompt lives in its own script and the deletion lives in `setup-ufw`,
ordered *after* `allow in on tailscale0` — there is never a moment with neither
path open. The two halves are coupled only through the rule comment
`lan break-glass`, since the address came from a prompt and `setup-ufw` cannot
name the rule it has to remove.

`setup-ufw-lan` runs `setup-sshd` before it writes the rule. Arch installs
`openssh` without enabling `sshd.service`, so a `port 22` rule on a stock box
opens a door with nothing behind it — and you find out at the moment you need
it. `ubuntu-devbox` can skip this because Ubuntu Server enables sshd itself.
`setup-sshd` is idempotent and `init` already ran it; the second call is for the
box where `init` didn't.

`setup-ufw-lan` writes `to any port 22 proto tcp` where Ubuntu writes
`app OpenSSH`: Arch's `openssh` ships no ufw application profile. Same rule.

The prompt itself is **shared**, not ported: it lives in
[`../common/ufw-lib`](../common/ufw-lib) along with the address validation,
subnet detection and the ufw delete-by-number walk, and `ubuntu-devbox` sources
the same file. Same reasoning as `pacman-base` and `harden-ssh` — the menu was
duplicated verbatim between the two boxes, and the delete walk existed in three
places. Each script supplies its own wording through `LAN_MENU_*` variables,
because the question means something different on a box that keeps the hole.

The shared version validates addresses in bash and `ip` rather than Python's
`ipaddress` module, which is what `ubuntu-devbox` used to use — Arch's base has
no Python, and this script may be the first thing run after `init`. Ubuntu has
bash and iproute2 too, so the portable implementation is the one that survives.
The subnet comes from the kernel's scope-link route on the uplink, so there is
no prefix arithmetic to do by hand.

### what `setup-ufw` blocks beyond deny-all-inbound

This machine runs AI harnesses against web projects, so the design point is that
something with a shell here is eventually driven by text it read off the
internet. Inbound rules do nothing about that; what matters is reach.

| | |
|---|---|
| egress to `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `255.255.255.255`, multicast | dropped **on the physical interface only** |
| same, as `ufw route` rules | so a container can't walk past the host rules |
| egress to `fc00::/7` (v6 unique-local), both forms | the v6 half of the same boundary. `fe80::/10` and `ff00::/8` are left alone — NDP runs over both, and dropping them removes IPv6 rather than hardening it |
| the default gateway | the one LAN peer left reachable, so DNS/NTP/internet work — only if the resolver runs on the gateway itself; a resolver elsewhere on the LAN (a pi-hole on its own box) is blocked same as anything else, see `./setup-dns` |
| DHCP to `255.255.255.255:67`, allowed out | added before the broadcast deny above it. `dhcpcd` and `systemd-networkd` use raw packet sockets that never reach the filter table; this is for anything that doesn't |
| `default deny routed` | ufw's own default, asserted rather than assumed. Not what enforces the isolation — the `ufw route deny` rules above match regardless of policy. It covers the forwarding paths with no rule at all (a tailnet subnet route, a second bridge), which `ufw default allow routed` on a box once used as a router would otherwise leave open |
| ICMP echo-request | answered on `tailscale0`, dropped on the VLAN |
| `IPT_SYSCTL` commented out in `/etc/default/ufw` | ufw otherwise re-applies `/etc/ufw/sysctl.conf` on every start, and `ufw-framework(8)` is explicit that it "overrides values in the system sysctl.conf" — it would silently undo the file below |
| `/etc/sysctl.d/99-arch-devbox-net.conf` | no redirects, no source routing, loose `rp_filter`, `log_martians` |

Scoping the denies to the uplink interface rather than to the subnets is what
keeps them from catching traffic that should pass: `docker0` and `tailscale0`
carry RFC1918 too, and a blanket subnet deny would break containers and any
tailnet subnet route. `rp_filter` is `2` (loose) rather than `1` for the same
reason — strict mode breaks exit nodes and subnet routes.

Denied egress is logged; `journalctl -kg '\[UFW BLOCK\]' -f` is the thing to
watch if a build starts failing.

#### the one rule ufw cannot enforce: never advertise routes

Do not run `tailscale up --advertise-routes` or `--advertise-exit-node` on this
box. Verified against the live tables:

```
# iptables -S FORWARD
-A FORWARD -j ts-forward        <- position 1, above everything
-A FORWARD -j DOCKER-USER
...
-A FORWARD -j ufw-before-forward

# iptables -S ts-forward
-A ts-forward -i tailscale0 -j MARK --set-xmark 0x40000/0xff0000
-A ts-forward -m mark --mark 0x40000/0xff0000 -j ACCEPT
```

`tailscaled` puts its own chain ahead of both Docker and ufw, and unconditionally
accepts anything forwarded in from `tailscale0`. So the moment this box forwards
tailnet traffic onward, none of the `ufw route` rules are consulted for it and
the box becomes a bridge from the tailnet straight into the VLAN. It doesn't
forward today — `setup-tailscale` advertises nothing, so every tailnet packet
terminates here and `INPUT` governs it. That is a property to preserve, and no
firewall rule can preserve it for you.

Three prefs switch forwarding on, and `setup-ufw` checks all three at the end of
its run and warns, since it cannot prevent them:

| pref | set by |
|---|---|
| `AdvertiseRoutes` non-empty | `--advertise-routes` |
| `AdvertiseRoutes` contains `0.0.0.0/0`, `::/0` | `--advertise-exit-node` — not a separate pref |
| `AppConnector.Advertise: true` | `--app-connector` |

The app connector is the one to watch: it advertises its routes *dynamically* as
it resolves the domains it fronts, so `AdvertiseRoutes` can still read `null` at
the moment you look. Checking only that field would miss it.

Note `tailscale debug prefs` is a debug subcommand with no stability guarantee,
and the check matches its JSON by string rather than parsing it. If a field is
renamed the check degrades to silence, not a false alarm — so it is a safety net,
not a control.

This is also most of the answer to "can't Tailscale bypass ufw?" — for `FORWARD`,
yes, exactly as above. For `INPUT` the evidence is indirect and worth stating as
such: `allow in on tailscale0` is demonstrably load-bearing (the box is
unreachable under `default deny incoming` without it), which means decrypted
packets from the `tailscale0` TUN do traverse ufw's chains. But `tailscaled` also
installs a `ts-input` chain, and **that chain has not been inspected here** — the
tables above cover `FORWARD` only. If you want it settled rather than inferred:

```bash
sudo iptables -S INPUT | head; sudo iptables -S ts-input
```

#### why the `ufw route` rules aren't redundant with ufw-docker

`ufw-docker install` writes a `DOCKER-USER` chain that looks like it already
covers this. It doesn't — the source-based `RETURN` rules sit *above* the
destination-based denies:

```
-A DOCKER-USER -j ufw-user-forward          <- first, which is what saves us
...
-A DOCKER-USER -s 172.16.0.0/12 -j RETURN   <- a container matches here
-A DOCKER-USER -d 192.168.0.0/16 -m conntrack --ctstate NEW -j ufw-docker-logging-deny
```

A container's own source address short-circuits to `RETURN` long before the
`-d <rfc1918>` denies, which exist for the reverse direction (outside → container).
`RETURN` leaves the chain rather than accepting, so the precise claim is that
container→LAN is **not denied** by ufw-docker, not that ufw-docker permits it.
Either way nothing stops it, and what closes it is `-j ufw-user-forward` being
DOCKER-USER's first rule.

##### the residual gap: forwarded ICMP

`before.rules` carries the blanket echo-request accept **twice** — once in
`ufw-before-input` (line 37) and once in `ufw-before-forward` (line 43).
`setup-ufw` patches only the first. So forwarded pings are governed by chain
order, not by a rule of ours:

- **Docker traffic is covered**, because `DOCKER-USER` is at `FORWARD` position 2
  and `ufw-before-forward` at position 5 — the isolation rules are reached first.
- **That ordering is runtime state, not a guarantee.** Docker re-inserts
  `DOCKER-USER` at the head of `FORWARD` when the daemon starts, ufw inserts its
  chains on reload. The observed order has Docker above ufw, and Docker only ever
  re-inserts *higher*, so it is stable in practice — but nothing asserts it.
- **Non-Docker forwarding paths are not covered at all.** Anything forwarded that
  doesn't traverse `DOCKER-USER` hits the blanket accept at position 5 before
  `ufw-user-forward` is consulted, and can ping the VLAN.

Closing it properly means interface- and destination-scoped DROP rules written
into `before.rules` with `$LAN_IFACE` interpolated — five rules, in a static file,
to cover a path this box doesn't currently have. Left open deliberately. Only
ICMP echo is affected; `ufw-before-forward` pre-accepts nothing else, so TCP and
UDP from any forwarding path still land on the `ufw route deny` rules. Verify
with `docker run --rm alpine ping -c1 -W2 <a VLAN host>` — it should fail.

**Not done: default-deny egress with an allowlist.** npm, PyPI, ghcr, Docker Hub,
GitHub and the model APIs all sit behind CDNs with rotating address space. An IP
allowlist for that is fiction, and one that gets `ufw allow out to any` appended
at the first broken build is worse than none. That job needs a filtering proxy.

### lockout

Once `setup-ufw` has run there is no LAN hole left, so if the tailnet dies the
only way in is a keyboard attached to this machine. `setup-ufw` guards the two
ways you could walk into that by accident: it refuses to run when `tailscaled`
isn't up, and refuses to cut a LAN ssh session out from under itself (it
compares the server-side address in `$SSH_CONNECTION` against
`tailscale ip -4`). `FORCE=1` overrides both.

The second guard is the one that fires in practice, because `setup-ufw-lan`
exists so you can get that far over the LAN: reconnect over the tailnet before
running `setup-ufw`.

`setup-ufw` warns if it finds sshd stopped, because sshd **is** the remote access
path — see below.

### the access model: real sshd, over the tailnet

**Tailscale SSH is not used on these machines.** `RunSSH` is always `false`;
`tailscale up --ssh` is not how you get in. Remote access is the ordinary
OpenSSH daemon, reached over the tailnet:

```bash
ssh user@<tailnet-ip>          # or: ssh user@<magicdns-name>
```

This is worth stating explicitly because the opposite assumption changes almost
every conclusion below it, and the two setups look identical until something
breaks:

| | Tailscale SSH on (`--ssh`) | **this setup** (`RunSSH: false`) |
|---|---|---|
| who answers port 22 on the tailnet IP | `tailscaled`, in userspace, before the host stack | sshd |
| what authenticates you | tailnet identity + the tailnet ACL's `ssh` block | `~/.ssh/authorized_keys` |
| is sshd reachable over the tailnet on 22 | no — tailscaled intercepts first | **yes** |
| effect of a broken tailnet ACL | locked out | none; there is no ssh ACL in play |

So there is no "Tailscale SSH ACL" to break here, and sshd is not a fallback
behind it — it is the path. `ufw allow in on tailscale0` opens every port, which
is what makes it reachable.

`setup-tailscale` defaults `TS_SSH=0` accordingly. Check the assumption rather
than trusting this table, if it matters:

```bash
tailscale debug prefs | grep RunSSH      # expect false
```

### what `harden-ssh` is for, given the above

[`harden-ssh`](harden-ssh) does what `setup-sshd` only prints as advice:
`PermitRootLogin no`, `PasswordAuthentication no`, `AllowUsers $USER`, key-only
auth, and a modern-crypto-only kex/cipher/MAC list. That part is wanted
regardless.

Its **port move off 22 is optional here.** With `--ssh` enabled tailscaled owns
22 on the tailnet IP and sshd must move elsewhere to be reachable at all; with
`RunSSH: false` nothing intercepts 22 and sshd already answers there. The move is
not obscurity either way — ufw drops everything that isn't `tailscale0`, so there
is no scanner to hide from; it just isn't buying anything.

`SSH_PORT=keep` therefore hardens auth and crypto while staying on 22, and on
this box that is the **reasonable** choice, not the weaker one. `harden-ssh`
detects `RunSSH` at runtime and adjusts what it tells you, treating undetectable
as off — the direction that warns harder.

Two phases, because a config that locks you out looks identical to a working one
until you try it. Phase 1 listens on **both** 22 and the new port; phase 2
(`--finalize`, offered interactively once you confirm a login worked) drops 22.
`--revert` removes both drop-ins.

### sshd hardening is shared

`harden-ssh` here is a **thin wrapper**; the logic lives in
[`../common/harden-ssh`](../common/harden-ssh) and is shared with
[`ubuntu-devbox`](../ubuntu-devbox). Same reasoning as `pacman-base`: the ~60
lines of auth and crypto settings were byte-identical between the two boxes, and
a `KexAlgorithms` line that has to be edited twice is the same drift bug as
`git-delta` being listed twice — with worse consequences.

The wrapper sets three things and execs the shared script:

| | arch-devbox | ubuntu-devbox |
|---|---|---|
| `SSH_UNIT` | `sshd` | `ssh` |
| `HARDEN_FIREWALL` | `none` — the firewall opens an interface, so a port move needs no rule and closing 22 leaves none behind | `ufw-lan` — mirror the break-glass rule onto the new port, delete the port-22 rules in phase 2 |
| `HARDEN_NET` | `tailnet` — no LAN hole; last resort is the console | `lan` — the break-glass path is ssh from the LAN |

Everything else is common, including one trap that only bites here: Arch's stock
`sshd_config` has no `Include /etc/ssh/sshd_config.d/*.conf` line, so a drop-in
written there is read by nobody — `sshd -t` passes, sshd restarts, every setting
is silently ignored. The shared script inserts the Include at line 1
(first-match-wins) and backs the original up to `/etc/ssh/sshd_config.orig`. It
is unconditional because it is a no-op wherever the line already exists, which
is everywhere else.

This replaces `../arch-hyprland/setup-packages/setup-ufw`, which does `ufw deny
SSH` and opens the syncthing profile — the opposite of what this box wants.

## staying awake

A box that suspends is a box you cannot ssh into — and it takes every path back
in with it — and since `setup-ufw` leaves no LAN hole, the tailnet is the whole
set. A suspended box needs a physical keyboard. `setup-no-sleep` handles it,
but is commented out in `init` — see
[idle behavior without masking sleep](#idle-behavior-without-masking-sleep)
for why `init` runs the lighter `setup-hypridle-no-suspend` instead.

Four separate things can suspend this machine:

| source | what it does |
|---|---|
| **hypridle** | `hypridle.conf` has a listener at `timeout = 1860` → `systemctl suspend` |
| **logind lid switch** | `HandleLidSwitch=suspend` is the default |
| **logind `IdleAction`** | defaults to `ignore` on Arch, but worth pinning |
| **gdm's greeter** | GNOME's power plugin suspends on idle at the login screen — which is where a devbox sits most of the time |

All four funnel through `sleep.target`, so masking it neutralises every one at
once without depending on any tool's config format. Everything else the script
does — the logind drop-in, the gdm gsettings — is about making the intent
explicit and keeping the journal quiet, not about correctness.

**Detaching the monitor is probably the lid switch, not an idle timer.** With an
external display attached a laptop counts as *docked*, so a closed lid follows
`HandleLidSwitchDocked` (ignore). Unplug the monitor and it is no longer docked,
so the lid follows `HandleLidSwitch` (suspend) — instant sleep on detach, no
timer involved. The drop-in sets all three lid settings to `ignore`.

Confirm it took:

```bash
systemctl suspend    # must fail: "Unit suspend.target is masked"
```

That one command proves all four sources are dead. Masking is immediate;
the lid settings need a reboot, which `init` offers when it finishes.

### hypridle gets its own config

The shared `hypr/.config/hypr/hypridle.conf` is left untouched — the laptop
genuinely wants its suspend listener. This box points hypridle at
[`hypridle.conf`](hypridle.conf) in this directory instead, which keeps the
screen-lock and DPMS-off listeners and drops:

- the **suspend** listener (`timeout = 1860`) — the whole point;
- the **screen-dim** and **keyboard-backlight** listeners —
  `brightnessctl -sd rgb:kbd_backlight` errors on hardware without a keyboard
  backlight, and dimming a usually-detached monitor is pointless.

It has to be a separate file rather than an override: hypridle listeners are
**additive**, so a sourced config can add a listener but never subtract one.

`setup-no-sleep` wires it up with a systemd user drop-in:

```ini
# ~/.config/systemd/user/hypridle.service.d/override.conf
[Service]
ExecStart=
ExecStart=/usr/bin/hypridle -c ~/dotfiles/setup/arch-devbox/hypridle.conf
```

The bare `ExecStart=` is required — without it systemd *appends* a second
command instead of replacing the unit's own.

A drop-in rather than swapping the file, because `~/.config/hypr` is a single
**folded stow symlink** into the repo: replacing one file inside it would either
write into the repo or leave a link that breaks the next `stow hypr` run — which
would abort `init` at the `stow hyprland` step. Nothing stows `~/.config/systemd`,
so that path is free.

This is belt-and-braces, not the protection itself: masking `sleep.target`
already makes the shared config's suspend listener inert. The config removes the
doomed `systemctl suspend` attempt from the journal and the brightness errors
along with it.

Reverse it with `sudo systemctl unmask sleep.target suspend.target
hibernate.target hybrid-sleep.target`. On a laptop this does mean the battery
runs flat instead of suspending.

### idle behavior without masking sleep

`setup-no-sleep` isn't run by `init` — it's opt-in, because on a machine you
sit at (the desktop, not the headless case) masking `sleep.target` also kills
*manual* suspend: a keybind or `systemctl suspend` resolves to the same masked
target as the idle timer, so there's no way to distinguish "the timer fired"
from "I asked for this." Skip it and hypridle falls back to the shared
`hypr/.config/hypr/hypridle.conf`, suspend listener included — the box goes to
sleep on its own after ~31 minutes idle.

To get the no-suspend idle behavior (lock, DPMS-off) while leaving manual
suspend alone, run `setup-hypridle-no-suspend` instead — it's just the
drop-in from the previous section, without the masking, logind drop-in, or
gdm gsettings:

```bash
setup/arch-devbox/setup-hypridle-no-suspend
```

### if it went unreachable but did not sleep

Rule out suspend first — if the box never slept, none of the above is your
problem:

```bash
uptime                                              # continuous? then it never slept
journalctl -b | grep -iE 'suspend|entering sleep|PM: suspend entry'
```

Clean suspend/resume entries mean sleep. **Continuous uptime with a network gap
means something put the radio to sleep, not the machine** — three candidates,
all installed by `init`:

- `setup-wifi-powersave` turns powersave **on** when the machine is on battery,
  which drops the association and takes the tailnet with it. Laptop-only. Check
  with `iw dev <iface> get power_save`.
- **TLP** owns `USB_AUTOSUSPEND` and can suspend a USB wifi adapter
  independently of `sleep.target` — masking sleep does nothing for it.
  Laptop-only. Check with `sudo tlp-stat -u`.
- **tuned** on the desktop side. The stock `powersave` profile's `script.sh`
  calls `enable_wifi_powersave` unconditionally, which is why `setup-tuned`
  writes a standalone profile rather than inheriting it. Check with
  `tuned-adm active` — anything other than `arch-devbox` means you are on a
  profile whose radio behaviour has not been vetted for this box.

## power management

Two branches, mutually exclusive because TLP and tuned drive the same sysfs
knobs and neither yields:

| | laptop | desktop |
|---|---|---|
| tool | TLP (`../arch-hyprland/setup-packages/setup-tlp`) | tuned (`setup-tuned`) |
| chosen by | `init`'s `is_laptop` branch | `init`'s `else` branch |

TLP is battery-oriented — with no `BAT*` present every `_ON_BAT` setting is dead
weight while it still does `systemctl mask systemd-rfkill` on the way past.
tuned covers the same knobs, so `setup-tuned` writes an `arch-devbox` profile
and activates it.

### why the profile does not inherit `powersave`

Inheriting the stock profile is the obvious move and it is wrong here. Read
`/usr/lib/tuned/profiles/powersave/` and it does four things this box would then
have to undo — one of which an override cannot undo at all:

| stock `powersave` | why not here |
|---|---|
| `script.sh` calls `enable_wifi_powersave` **unconditionally** | exactly the failure documented above — continuous uptime, dead tailnet. A child profile cannot cancel an inherited `[script]`; undoing it needs `[script] replace=1` plus a second script calling `disable_wifi_powersave` |
| `boost=0` | turbo off. Fine on a battery, a straight tax on every compile |
| `governor=schedutil\|conservative\|powersave` | fine, and **kept verbatim** — see below |
| `vm.laptop_mode=5` | batches writeback for disks that spin down. This box's never do; it only widens the loss window on a power cut |

So the profile is standalone. Values that were simply right — `alpm=med_power_with_dipm`,
the governor list, `audio timeout=10` — were copied from `powersave` rather than
reinvented; everything else is there on purpose.

Two details worth knowing before editing it:

- **`|` is a fallback list, not a preference.** tuned applies the first value the
  running system actually offers. `governor=schedutil|conservative|powersave`
  lands on `powersave` under active-mode pstate (which offers nothing else) and
  on `schedutil` under `acpi-cpufreq` — which is why hardcoding plain
  `powersave` is a downgrade, not a tightening: on the acpi-cpufreq path it pins
  the minimum frequency.
- **`[usb] autosuspend=0` disables autosuspend**, it is not a zero-second delay.
  The plugin writes a boolean, not a timeout. It is belt-and-braces here —
  nothing in the profile enables autosuspend, and stock `powersave` only does so
  when `USB_AUTOSUSPEND=1`.

**The governor is usually not the lever people expect.** On `intel_pstate` or
`amd-pstate-epp` in active mode the only two governors that exist are
`powersave` and `performance`, and `powersave` is already the default — setting
it changes nothing. The knob that actually varies power there is the
energy-performance preference. Check which world you are in first:

```bash
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_driver   # intel_pstate / amd-pstate-epp = active mode
sudo tuned-adm verify                                     # reports anything tuned could not apply
```

Bigger wins than any of this, if idle draw is what you care about: enable
package C-states and ASPM in the UEFI (commonly shipped disabled on desktop
boards, and worth more than every userspace setting combined), and don't run a
graphical session on a box you only ever reach over ssh.

## databases over tailscale

> *Can I use MongoDB Compass and Beekeeper Studio with a Tailscale SSH
> connection by exposing the DB port?*

Yes — and you don't need an SSH tunnel at all.

**Run the GUI on your laptop, not here.** Both are desktop apps; if arch-devbox
is the machine you reach *into*, they belong on the arch-hyprland laptop that
already has them via flatpak. That's also the honest reason flatpak stays off in
this directory — not a judgment call about minimalism.

**Connect direct over the tailnet.** `setup-ufw` runs `ufw allow in on
tailscale0`, which opens *every* port to the tailnet. So `mongodb://devbox:27017`
or `postgres://devbox:5432` works from the laptop with no per-port firewall rule
and no tunnel.

The one thing that will bite is the same shape as the Vite `host: true` gotcha —
**databases bind loopback by default**, so the port is "open" and still answers
nothing:

| database | setting | change to |
|---|---|---|
| MongoDB | `net.bindIp` (`/etc/mongodb.conf`) | `0.0.0.0`, or the tailnet IP |
| PostgreSQL | `listen_addresses` (`postgresql.conf`) | `'*'`, plus a `pg_hba.conf` line for `100.64.0.0/10` |
| MySQL/MariaDB | `bind-address` | `0.0.0.0` |

**If the database runs in Docker, the tailnet-is-open rule does not apply.**
This is the part that costs people an afternoon, so be precise about why:

- Docker publishes ports by writing its own iptables DNAT rules. Left alone,
  those **bypass ufw's INPUT chain** — a container is reachable on every
  interface no matter what `ufw status` says.
- `ufw-docker install` (run by `setup-ufw-base`) closes that hole by filtering
  container traffic in the `DOCKER-USER` chain instead. But `ufw allow in on
  tailscale0` is an **INPUT** rule, and it does not govern `DOCKER-USER`.

So for containers, expect to need an explicit grant:

```bash
sudo ufw-docker allow <container-name> <port>
sudo ufw reload
```

Find out in ten seconds rather than guessing — from the laptop, against a
throwaway container on the box:

```bash
# on arch-devbox
docker run -d --name pgtest -p 5432:5432 -e POSTGRES_PASSWORD=x postgres
# from the laptop
nc -vz devbox 5432
```

If that refuses, `ufw-docker allow` is required, not optional — and the same
applies to every containerized dev server, not just databases. Publishing on the
tailnet address is worth doing regardless, as defense in depth rather than as a
substitute for the grant:

```bash
docker run -p "$(tailscale ip -4):5432:5432" postgres
```

A **host** process — `pnpm dev`, or a database installed from pacman — is not
affected by any of this; the `tailscale0` rule covers it directly.

**Why not the apps' built-in SSH tunnel?** `tailscale up --ssh` makes
`tailscaled` the listener on port 22 of the tailnet IP, so a tunnel aimed at
`devbox:22` reaches tailscaled rather than sshd. It's avoidable friction for
something the tailnet already gives you directly.

## relation to ubuntu-devbox

[`ubuntu-devbox`](../ubuntu-devbox) is a **headless** box driven over ssh and
Tailscale. This one is a graphical workstation that is *also* reachable that way.

`setup-tailscale` started as a port and is now the same file: both boxes run
[`../common/setup-tailscale`](../common/setup-tailscale) through a thin local
wrapper that installs tailscale the way that distro does it (`pacman` here, the
curl installer there) and sets two variables — whether this script or `setup-ufw`
owns the `tailscale0` rule, and what to print as the next step. Everything from
`tailscale up` onward, including the ACL warning, is shared. `setup-ufw` started as a port and has
since diverged, and then split: the Ubuntu one prompts for a LAN ssh hole and
keeps it as break-glass, while here the prompt is its own script
(`setup-ufw-lan`) and `setup-ufw` deletes the hole on its way to tailnet-only
plus VLAN isolation (see [firewall](#firewall)). What the two still share is the
LAN-source prompt, the rule-deletion walk, and the install/enable/reload dance
(`ufw_bootstrap`, `ufw_commit` — the distro's package manager is detected in the
one place rather than branched in each caller), all of which they source from
[`../common/ufw-lib`](../common/ufw-lib) rather than each keeping a copy.
`setup-ufw-base` sources it too.
`harden-ssh` is **not** a port — it is the same file. Both boxes run
[`../common/harden-ssh`](../common/harden-ssh) through a thin local wrapper; see
[sshd hardening is shared](#sshd-hardening-is-shared). Its `encrypt-data-disk` and
`setup-root-autounlock` were **not** ported — they are apt/Ubuntu-specific and
you didn't ask for them. If you later want full-disk encryption with TPM2
auto-unlock here, that directory is the reference, but the Arch equivalents
would need `sd-encrypt` in `mkinitcpio.conf` rather than
`cryptsetup-initramfs`, so it is a real port rather than a path swap.

Its `README.md` is also worth reading for the tailnet ACL snippet that
`tailscale up --ssh` needs, the reasoning behind keeping sshd as a LAN-only
recovery path, and the Vite `host`/`allowedHosts` settings for reaching dev
servers over the tailnet — all of which apply here unchanged.
