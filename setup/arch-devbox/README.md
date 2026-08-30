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
is never unprotected between steps — `setup-ufw-base` writes no allow rules at
all, just the default-deny policy.

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
| `idle.json` | one-field Idle Ladder override — no Suspend Stage; shared Dim, Lock and Blank remain |
| `setup-tuned` | desktop power management — the non-laptop half of `init`'s TLP branch (wrapper over [`../common/setup-tuned`](../common/setup-tuned)) |
| `setup-dns` | points this box at Cloudflare instead of a LAN-only resolver `setup-ufw`'s VLAN isolation would block (wrapper over [`../common/setup-dns`](../common/setup-dns)); see [dns](#dns) |
| `docker` | rootless docker via [`../common/setup-rootless-docker`](../common/setup-rootless-docker), called directly (no local wrapper) — an AI harness box shouldn't hand a compromised container a root-owned daemon |
| `setup-ufw-base` | non-interactive deny-all baseline, run by `init` |
| `setup-ufw-lan` | step 1: a temporary ssh hole from one LAN machine, so the rest can be driven remotely |
| `setup-tailscale` | join the tailnet, open `tailscale0` in ufw (wrapper over [`../common/setup-tailscale`](../common/setup-tailscale)) |
| `setup-ufw` | step 2: allow the tailnet, delete the LAN hole, cut the box off from the rest of the VLAN |

Borrowed unchanged from `../arch-hyprland`: `utils/*`, `preflight`, `theme`,
`gnome-theme`, `keyring`, `logo.txt`, `setup-omarchy-repos` and
`setup-packages/` — except `setup-packages/setup-ufw`, which does `ufw
deny SSH` and opens the syncthing profile (see [firewall](#firewall)).
The package lists this box runs live in
[`../common/packages`](../common/packages): `pacman-base`, `yay-packages`,
`go-packages` and `quickshell-packages`. `flatpak-packages` is there too but
this box leaves it off (see [flatpak](#flatpak-is-off-by-default)).
Docker comes from [`../common/setup-rootless-docker`](../common/setup-rootless-docker)
directly on both boxes, not from `setup-packages/` at all.

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
  in [`../common/packages/pacman-base`](../common/packages/pacman-base);
  only `packages/pacman-apps` is still local. Adding a CLI tool to `pacman-base`
  now reaches both machines — which is the failure this prevents. `ubuntu-devbox`
  is a third hand-maintained copy of the same toolkit and has already drifted:
  commit `f362aa2` dropped `aichat`, `worktrunk` and `lazydocker` there only, and
  it lists `git-delta` twice.
- **`packages/yay-packages`** → deleted. Its body was `exit 0`. `yay` itself is
  still installed by `setup-packages/setup-yay`.
- **`packages/flatpak-packages`** → deleted. Every install line in *this box's*
  copy was commented out. The shared list at
  [`../common/packages/flatpak-packages`](../common/packages/flatpak-packages)
  is a different file with live install lines, and `init` did call it until the
  step was commented out to match `setup-flatpak`; see
  [flatpak](#flatpak-is-off-by-default).

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
quickshell, hyprpolkitagent, the portal,
hyprsunset, swaybg, brightnessctl, pavucontrol, nwg-look), ghostty, fonts,
screenshots (swappy/slurp/grim), nautilus, gnome-disk-utility, and the
Greeter. The desktop is unusable without them.

quickshell's own runtime dependencies (`ttf-fira-code`, `libqalculate`,
`cliphist`, `wl-clipboard`, `libnotify`, `playerctl`) are **not** in any
`pacman-*` list. They live in
[`../common/packages/quickshell-packages`](../common/packages/quickshell-packages),
which both `init`s run — the shell is byte-identical on both targets, so its
dependency list is declared once. Add a dependency there when a QML module
starts shelling out to something new.

`gnome-keyring` and `seahorse` are **not** optional: `setup-hyprland` enables
`gcr-ssh-agent.service`, which is what unlocks ssh keys on this desktop.

`stow-backgrounds` also stays. It looks cosmetic but `df-theme-set` reads
`~/.config/backgrounds/<theme>.*` and warns when a theme has no wallpaper.

### the omarchy repo is required

`worktrunk`, `opencode`, `claude-code`, `tea` and `quickshell` are installed
with plain `pacman -S` but are not in the official Arch repos — they come
from the omarchy repo. Dropping `setup-omarchy-repos` as "not minimal" breaks
half of `pacman-base` plus the Hyprland steps.

### flatpak is off by default

The flatpak set was zen browser, Quran, MongoDB Compass and Beekeeper Studio.
The first two are replaced or non-dev; **Compass and Beekeeper are genuinely dev
tools**, and they are the one real loss in this cull.

If you want a database GUI, uncomment **both** `run_step`s in `init` — `flatpak`
(installs flatpak, adds the flathub remote) and `flatpak packages` (installs from
[`../common/packages/flatpak-packages`](../common/packages/flatpak-packages),
which already lists Compass and Beekeeper). They are twelve lines apart and were
once out of step: the packages step ran on a box where flatpak was never
installed, so `flatpak install` hit a missing command and failed the run. Turn
them on and off together.

### webapps

`arch-hyprland/packages/webapp-packages` (ChatGPT, Figma, LinkedIn, Facebook,
Memrise, …) is not referenced here. Note it isn't referenced by arch-hyprland's
`init` either — it has always been a run-it-yourself script. Chromium installs
PWAs on demand, so there's nothing to replace.






Several CLIs need an interactive login on first run (`claude`, `opencode`,
`gemini`, `kilo`) — `init` prints a reminder at the end.

## dns

Two independent things can be wrong with name resolution on this box, and they
have different fixes:

| symptom | cause | fix |
|---|---|---|
| nothing resolves at all once `setup-ufw` has run | the LAN resolver isn't the gateway, and VLAN isolation drops it | [`setup-dns`](setup-dns) — opt-in, points this box at a public resolver |
| everything resolves, but `gpg --recv-keys` fails | dirmngr resolves with its own bundled resolver, and its TLS stalls on hkps | [`../common/setup-dirmngr`](../common/setup-dirmngr) — run by `init` |

### gpg key imports: two faults behind one message

Both were live on this box, stacked — fixing the first only changed the error
message. Neither has anything to do with the DNS servers `setup-dns` selects.

dirmngr links **libdns** rather than using glibc, and reads `/etc/resolv.conf`
directly. On this box that file is systemd-resolved's stub (`127.0.0.53`), which
is a forwarder in front of policy dirmngr does not implement — resolved's
split-DNS routing, MagicDNS, a pi-hole upstream. Lookups fail, and gpg reports
it as:

```
gpg: keyserver receive failed: Server indicated a failure
```

which names neither DNS nor dirmngr. The tell is that **curl to the same
keyserver works** — everything except gpg uses the system resolver.

`setup-dirmngr` writes `standard-resolver` into `dirmngr.conf`, which turns
libdns off and hands resolution back to `getaddrinfo(3)`. It does this for two
separate keyrings, because they are separate gnupg homes with separate configs:
`~/.gnupg` (what makepkg and yay use) and `/etc/pacman.d/gnupg` (what
`pacman-key --refresh-keys` uses). Then it kills any running dirmngr — the
daemon reads its config once, at startup.

Arch already agrees, which is worth knowing before doubting the fix:
`pacman-key --init` writes `standard-resolver` into the pacman keyring's
`dirmngr.conf` itself. Only `~/.gnupg` was missing it, and `~/.gnupg` is the one
makepkg uses.

#### fault two: dirmngr's TLS, which is why the keyserver is plaintext

With the resolver fixed the error only changes:

```
gpg: keyserver receive failed: Try again later
```

after a flat 20s stall, with nothing between the request and the failure even at
`debug-level guru`:

```
08:58:44 dirmngr[8048.6] DBG: chan_6 <- KS_GET -- 0xBE677C19…
08:59:04 dirmngr[8048.6] command 'KS_GET' failed: Try again later
```

Four measurements on this box, same daemon, same hosts, same minute:

| | result |
|---|---|
| `hkp://keyserver.ubuntu.com:80` | imports in under a second |
| `hkps://keyserver.ubuntu.com` | 20s stall, `EAGAIN` |
| the same hkps URL via `curl -4` | full key body in 0.76s |
| `hkps://keys.openpgp.org` | stalls identically — not one server's fault |

TCP, DNS, routing, MTU and egress are therefore all fine. What fails is TLS
*inside dirmngr*, which uses its own stack rather than the OpenSSL curl links.
**Cause not identified.** Ruled out along the way: DNS (`resolvectl` answers),
IPv6 (`disable-ipv6` changed nothing), path MTU (a full-body `curl` GET
succeeds), and the keyserver itself.

So `setup-dirmngr` defaults to **plaintext `hkp://keyserver.ubuntu.com:80`**.
That is a trade worth stating rather than burying:

- **No key-integrity guarantee is lost.** `gpg --recv-keys <fingerprint>` and
  makepkg's `validpgpkeys` both match on the full fingerprint, and producing a
  key that collides with a given fingerprint is precisely what OpenPGP
  fingerprints exist to prevent. Plaintext HKP moves no secret and grants no
  trust that TLS was supplying.
- **What it does cost** is confidentiality of which keys this box fetches, and
  it lets anyone on the path deny the fetch. Neither blocks a build.

`DIRMNGR_KEYSERVER=hkps://keyserver.ubuntu.com setup/common/setup-dirmngr`
switches it back once the TLS fault is understood. Note the script leaves an
existing `keyserver` line alone, so flipping it on a box that already ran means
editing `~/.gnupg/dirmngr.conf` by hand.

It runs in `init` **immediately before `yay packages`**, which is the step that
needs it: makepkg verifies AUR source signatures against the PKGBUILD's
`validpgpkeys` and fetches missing keys with `gpg --recv-keys`, so
`helium-browser-bin` fails at the verify step on a box where every other network
operation is fine. Existing settings are left alone, so a hand-picked keyserver
survives a re-run.

**`../arch-hyprland/init` deliberately does not run it**, even though it runs the
same `packages/yay-packages` with the same `helium-browser-bin`. That box is not
isolated — no VLAN boundary, no public-resolver override, so its lookups take the
plain path dirmngr can follow. The script is in `../common/` rather than this
directory because that is where shared implementations live, not because both
inits call it; adding the `run_step` there is one line if it ever does bite.

If it still fails after that, the problem is below gpg — check egress, not
dirmngr:

```bash
curl -sI 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xBE677C1989D35EAB2C5F26C9351601AD01D6378E'
resolvectl status
```

To see the real error instead of the vague one, add `verbose`, `debug-level
basic` and `log-file /tmp/dirmngr.log` to `~/.gnupg/dirmngr.conf`, `gpgconf
--kill dirmngr`, retry, and read the log — it names resolution failure, TLS
handshake or an HTTP status. Strip those three lines back out afterwards.

## docker

Rootless, via [`setup-rootless-docker`](../common/setup-rootless-docker) — `curl
-fsSL https://get.docker.com/rootless | sh` — not the plain `pacman -S docker`
of `setup/archive/setup-docker`, on the `archive/rootful-docker` branch —
retired when arch-hyprland finished its own move to rootless (#95).
This box runs AI harnesses against text pulled off the internet (see
[firewall](#firewall)); a compromised container landing on a root-owned
daemon is a worse outcome than the same container landing on a daemon that
runs as `$USER` and can be torn down by killing a user session.

The consequence that matters elsewhere in this file: rootful dockerd
publishes ports with its own iptables DNAT rules, which bypass ufw's INPUT
chain entirely — that's what `ufw-docker` exists to plug, and it's why
arch-hyprland's `setup-ufw` and this box's old baseline both installed it,
back when both boxes still ran rootful docker. Rootless dockerd has no root
to write host iptables with. RootlessKit's
builtin port driver publishes a container port as an ordinary userspace
listener owned by this user instead, so ufw's normal rules already govern it
— no `docker0` exception, no `DOCKER-USER` chain, no `ufw-docker` package.
`setup-ufw-base` reflects that: it installs nothing beyond the deny-all
policy. See [databases over tailscale](#databases-over-tailscale) for the
consequence from the other side (a container's *published* port), and
[the `ufw route` rules were written for rootful docker](#the-ufw-route-rules-were-written-for-rootful-docker)
for the egress side.

### what `setup-rootless-docker` does, and why each step is there

`get.docker.com/rootless` is a **bootstrap wrapper**, not the setuptool
itself — it gates on its own requirements first, extracts the binaries, and
only then execs `dockerd-rootless-setuptool.sh install` (a separate, longer
script) to actually configure and start the daemon. That distinction matters
for the first bullet below: reading the wrong one of the two scripts is what
had this section briefly, and wrongly, arguing to remove the modprobe step
entirely.

- `sudo modprobe ip_tables`, persisted via
  `/etc/modules-load.d/arch-devbox-docker.conf`. The wrapper hardcodes an
  `lsmod | grep ip_tables` gate before it will extract anything —
  unconditionally, regardless of whether the box actually runs legacy
  iptables or iptables-nft:
  ```sh
  # ip_tables module dependency check
  if [ -z "$SKIP_IPTABLES" ] && ! lsmod | grep ip_tables >/dev/null 2>&1 && ...; then
      INSTRUCTIONS="${INSTRUCTIONS}
  modprobe ip_tables"
  fi
  ```
  This box is on iptables-nft (`iptables --version` reports `(nf_tables)`,
  and normal container networking never touches `ip_tables` — confirmed
  empirically, a published port works fine with the module unloaded). So this
  modprobe exists purely to satisfy the wrapper's one-time gate, not because
  dockerd needs the module at runtime — which is also why it's safe to load
  unconditionally: it does nothing for the box's actual traffic path, it just
  needs to be *present* for `lsmod` to see it. It's the exact fix for the
  literal error this box hit on its first `curl | sh`:
  ```
  # ip_tables module dependency check
  # Missing system requirements. ...
  cat <<EOF | sudo sh -x
  modprobe ip_tables
  EOF
  ```
  Persisted rather than one-shot so a future re-run of the installer (a
  docker version bump, say) doesn't hit the same gate again after a reboot.

  The setuptool the wrapper execs *afterward* has its own, smarter version of
  this same idea — it reads `iptables --version` and picks `nf_tables` or
  legacy `ip_tables` accordingly, printing its own `sudo sh -eux <<EOF ...`
  block if that one's missing. It's a different check on a different script,
  reached only once the wrapper's cruder gate above has already passed; on
  this box it never fires, since `nf_tables` is already loaded by the time
  the wrapper gets there.
- Disables and removes any rootful `docker` package first — a stale rootful
  daemon would fight the rootless one over the docker group and iptables
  state. `docker.service` and `docker.socket` are checked and stopped
  independently, not with one `disable --now` for both — either unit can
  exist without the other, and `disable --now` on a unit that isn't there
  aborts the script under `set -e`.
- No local `/etc/subuid`/`/etc/subgid` check. It's validated by the
  same `checks()` gate as `ip_tables` above (and again, independently, by
  `dockerd-rootless-setuptool.sh` if run standalone later), printing its own
  fix — `echo "$USER:100000:65536" >> /etc/subgid` — if it's missing. Unlike
  `ip_tables`, this one was never actually observed to block anything on this
  box: Arch's `useradd` allocates these by default since 2019, and the
  entries were already there before any of this ever ran. Kept unguarded on
  that basis rather than mirrored like the modprobe step — cheap to add back
  if a future box proves that assumption wrong.
- `loginctl enable-linger $USER` — without it, dockerd dies the moment the
  last session for this user ends: closing the one ssh session, or logging
  out of the graphical session. That defeats the point of a box meant to stay
  reachable over the tailnet when nobody is at the keyboard.
- Runs the installer only if `~/.config/systemd/user/docker.service` is
  missing — **not** whether `~/bin/dockerd` exists. The wrapper's `checks()`
  (`ip_tables` included) all run *before* it extracts anything, so a gate
  failure like this box's first attempt leaves no binary behind either way —
  both guards would have worked for the exact failures this box hit. The
  case that actually matters is a run that got past extraction and then
  failed *inside* the setuptool step: the wrapper's own "already installed"
  check short-circuits any later `curl | sh` to printing manual `rm -f
  ~/bin/dockerd` instructions and exiting 0, without retrying setup. Guarding
  on the binary would silently no-op through that message and then crash
  this script's own `systemctl --user enable` a few lines down against a
  unit that was never created — so the script clears the binary first
  whenever it's about to retry.
- Writes `~/.config/docker/daemon.json` with the same log-size cap
  `setup/archive/setup-docker` (now on `archive/rootful-docker`) used to write
  to `/etc/docker/daemon.json` back when arch-hyprland ran it — rootless dockerd
  reads its own config in the user's `$DOCKER_CONFIG` (`zsh/.zshenv`), not
  the system one, so carrying the cap over verbatim would otherwise silently
  lose it.
- Enables and starts the `docker.service` **systemd user unit** the
  installer writes to `~/.config/systemd/user/` — not the system unit the
  old rootful step enabled.
- Installs `docker-compose` and `docker-buildx` from pacman regardless — they
  are CLI plugins that work fine against a rootless `DOCKER_HOST` and don't
  pull the rootful `docker` package back in as a dependency, so there's no
  reason to hand-roll them into `~/.docker/cli-plugins` instead. Confirmed
  with `docker compose version` and `docker buildx version` against the
  static `~/bin/docker`.

### network driver

RootlessKit picks `slirp4netns` if it's installed, else `pasta`, else falls
back to the bundled `gvisor-tap-vsock` — no separate package needed for the
last one, it's linked into the `rootlesskit` binary the installer drops in
`~/bin`. Nothing in `setup-rootless-docker` pins one, so a fresh install gets
whichever of those three is available; check what's actually running with:

```bash
ps -o args= -C rootlesskit
```

### env

`zsh/.zshenv` sets `DOCKER_HOST=unix:///run/user/$UID/docker.sock` and
`DOCKER_CONFIG="$XDG_CONFIG_HOME/docker"`, and puts `~/bin` — where the
installer drops `docker`, `dockerd`, `dockerd-rootless.sh` and friends — on
`PATH`. All three are what make `docker` and `lazydocker` (already in
`packages/pacman-base`) work as this user without `sudo` or a `docker` group.

## firewall

Tailnet-only. Everything you actually use arrives on `tailscale0`; the LAN gets
no hole at all. This box sits on its own VLAN, and the firewall enforces that
boundary rather than trusting it.

It is split across three files because only the first can run during `init`:

- **`setup-ufw-base`** (run by `init`, non-interactive) — `default deny
  incoming`, `default allow outgoing`, no allow rules at all. No `ufw-docker
  install` and no docker0 DNS rule: this box's docker
  (`../common/setup-rootless-docker`) is rootless, has no host-visible
  bridge, and publishes ports as an ordinary
  userspace listener rather than DNAT rules that bypass ufw — see
  [databases over tailscale](#databases-over-tailscale). No rule reachable
  from any network, so there is no lockout risk in enabling it mid-install.
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
keeps them from catching traffic that should pass: `tailscale0` carries
RFC1918 too, and a blanket subnet deny would break any tailnet subnet route.
(Rootless docker has no host-visible `docker0` to worry about here — see
[docker](#docker) — but the same logic would apply to one if this box ever
went back to rootful.) `rp_filter` is `2` (loose) rather than `1` for the same
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

#### the `ufw route` rules were written for rootful docker

This box now runs rootless docker (`../common/setup-rootless-docker`), which
changes what this section is about. Kept for reference — the reasoning still
applies the day this box goes back to rootful, and the ICMP note below builds
on it.

`ufw-docker install` writes a `DOCKER-USER` chain that looks like it already
covers container→LAN. It doesn't — the source-based `RETURN` rules sit
*above* the destination-based denies:

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
Under rootful docker, what actually closes it is `-j ufw-user-forward` being
DOCKER-USER's first rule — which is what the `ufw route deny` rules above feed
into.

**Rootless docker sidesteps this chain entirely, which is a stronger position,
not a weaker one.** RootlessKit's networking runs inside this user's own
network namespace: a container's packets are NAT'd there and re-emerge on the
host as ordinary process traffic from `rootlesskit`/`dockerd-rootless.sh`, not
as a forwarded packet on `FORWARD` at all. The OUTPUT-chain `ufw deny out`
rules above already cover that the same as any other process — no
`DOCKER-USER` chain needed, and none of the `RETURN`-before-deny ordering
above to reason about. The `ufw route deny` half of each pair is inert for
Docker on this box now; it stays in the script rather than being deleted so it
is there again if this box ever goes back to rootful.

##### the residual gap: forwarded ICMP

`before.rules` carries the blanket echo-request accept **twice** — once in
`ufw-before-input` (line 37) and once in `ufw-before-forward` (line 43).
`setup-ufw` patches only the first. So forwarded pings are governed by chain
order, not by a rule of ours — for whatever traffic actually reaches
`FORWARD` in the first place.

- **Rootless docker isn't a factor here**, for the same reason as above:
  container traffic never reaches `FORWARD`, so there's no `DOCKER-USER`
  ordering to reason about and no need to verify container pings the way the
  rootful case below used to require.
- Under rootful docker + ufw-docker, Docker traffic *was* covered, because
  `DOCKER-USER` sits at `FORWARD` position 2 and `ufw-before-forward` at
  position 5 — the isolation rules are reached first. That ordering is
  runtime state, not a guarantee: Docker re-inserts `DOCKER-USER` at the head
  of `FORWARD` when the daemon starts, and ufw inserts its chains on reload.
  The observed order has Docker above ufw, and Docker only ever re-inserts
  *higher*, so it was stable in practice — but nothing asserted it.
- **Non-Docker forwarding paths are still not covered at all.** Anything
  forwarded through this box that doesn't traverse a chain positioned ahead of
  `ufw-before-forward` hits the blanket accept at position 5 before
  `ufw-user-forward` is consulted, and can ping the VLAN. This box currently
  has no such path — nothing else routes through it — so it is a latent gap,
  not an active one.

Closing it properly means interface- and destination-scoped DROP rules written
into `before.rules` with `$LAN_IFACE` interpolated — five rules, in a static
file, to cover a path this box doesn't currently have. Left open deliberately.
Only ICMP echo is affected; `ufw-before-forward` pre-accepts nothing else, so
TCP and UDP from any forwarding path still land on the `ufw route deny` rules.

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

This wrapper leaves `TS_SSH=0`, so remote access is the ordinary OpenSSH daemon
over the tailnet:

```bash
ssh user@<tailnet-ip>          # or: ssh user@<magicdns-name>
```

`ufw allow in on tailscale0` makes sshd reachable. Check the runtime state with:

```bash
tailscale debug prefs | grep RunSSH      # expect false
```

See [`../common/README.md`](../common/README.md#tailscale-and-sshd) for the
shared access-model rationale and the effects of opting into Tailscale SSH.

### what `harden-ssh` is for, given the above

[`harden-ssh`](harden-ssh) does what `setup-sshd` only prints as advice:
`PermitRootLogin no`, `PasswordAuthentication no`, `AllowUsers $USER`, key-only
auth, and a modern-crypto-only kex/cipher/MAC list. That part is wanted
regardless.

Its **port move off 22 is optional here**. Both that reasoning and the
two-phase rollout performing it are documented once in
[`../common/README.md`](../common/README.md#why-move-the-port). The verdict for
this box: with `RunSSH: false` and ufw dropping everything that isn't
`tailscale0`, the move buys nothing, so `SSH_PORT=keep` — auth and crypto
hardened, still on 22 — is the **reasonable** choice here, not the weaker one.

### sshd hardening is shared

`harden-ssh` here is a **thin wrapper**; the logic lives in
[`../common/harden-ssh`](../common/harden-ssh) and is shared with
[`ubuntu-devbox`](../ubuntu-devbox). Same reasoning as `pacman-base`: the ~60
lines of auth and crypto settings were byte-identical between the two boxes, and
a `KexAlgorithms` line that has to be edited twice is the same drift bug as
`git-delta` being listed twice — with worse consequences.

The Box Wrapper sets three things and executes the Shared Setup Script:

| | arch-devbox | ubuntu-devbox |
|---|---|---|
| `SSH_UNIT` | `sshd` | `ssh` |
| `HARDEN_FIREWALL` | `none` — the firewall opens an interface, so a port move needs no rule and closing 22 leaves none behind | `ufw-lan` — mirror the break-glass rule onto the new port, delete the port-22 rules in phase 2 |
| `HARDEN_NET` | `tailnet` — no LAN hole; last resort is the console | `lan` — the break-glass path is ssh from the LAN |

Everything else is common, including one trap that only bites here: Arch's stock
`sshd_config` has no `Include /etc/ssh/sshd_config.d/*.conf` line, so a drop-in
written there is read by nobody — `sshd -t` passes, sshd restarts, every setting
is silently ignored. The Shared Setup Script inserts the Include at line 1
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
for why `init` installs no-suspend Idle Ladder timings instead.

The three suspend paths and why systemd's sleep targets are the boundary live in
[`../common/README.md`](../common/README.md#staying-awake). On this box,
the Idle Ladder is present, and a detached monitor can change which logind lid
policy applies.

Confirm it took by inspecting `~/.config/df/idle.json`: it contains only
`{ "suspend": null }`. The Session Lock merges that override onto the shared
timings, so the devbox still dims, locks and blanks. Manual `systemctl suspend`
remains available. The opt-in `setup-no-sleep` script is the separate mechanism
that masks sleep targets and changes that policy; its lid settings need a reboot.

### the Idle Ladder gets box timings

The laptop links the shared timing data to `~/.config/df/idle.json` during
`init`, outside the folded Quickshell stow tree. The devbox selects its
[`idle.json`](idle.json) override at the same path. Quickshell's timing defaults
merge the override onto the shared Dim, Lock, Blank and Suspend values; the one
explicit `null` removes only the Suspend Stage. The lock reads both files at
startup, so changing them takes effect after `df-qs-restart lock` or the next
login.

Reverse it with `sudo systemctl unmask sleep.target suspend.target
hibernate.target hybrid-sleep.target`. On a laptop this does mean the battery
runs flat instead of suspending.

### idle behavior without masking sleep

`setup-no-sleep` isn't run by `init` — it's opt-in, because on a machine you
sit at (the desktop, not the headless case) masking `sleep.target` also kills
*manual* suspend: a keybind or `systemctl suspend` resolves to the same masked
target as the idle timer, so there's no way to distinguish "the timer fired"
from "I asked for this." The devbox timing override distinguishes them by
omitting only the Idle Ladder's Suspend Stage. To restore that link without
changing system sleep policy, run:

```bash
~/dotfiles/setup/common/setup-idle-ladder ~/dotfiles/setup/arch-devbox/idle.json
df-qs-restart lock
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

The profile body and its choice not to inherit the stock `powersave` profile
are shared. See
[`../common/README.md`](../common/README.md#power-management). Check the active
driver and whether tuned applied every setting:

```bash
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_driver   # intel_pstate / amd-pstate-epp = active mode
sudo tuned-adm verify                                     # reports anything tuned could not apply
```

For this desktop, package C-states and ASPM in UEFI can matter more than the
userspace profile. A headless box also avoids the graphical session's idle
draw.

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

**If the database runs in Docker, the tailnet-is-open rule applies the same as
anything else — no extra grant needed.** This is the opposite of what it would
be under rootful docker, and worth being precise about why, since it's easy to
carry the wrong assumption over from another box:

- Rootful dockerd publishes ports by writing its own iptables DNAT rules,
  which **bypass ufw's INPUT chain** — a container would be reachable on every
  interface no matter what `ufw status` says, and would need `ufw-docker
  allow` (or a DOCKER-USER-level grant) to be scoped back down to the tailnet.
- This box's docker (`../common/setup-rootless-docker`) is **rootless**.
  RootlessKit's builtin port driver publishes a container port as an ordinary
  userspace listener
  owned by this user, not a DNAT rule — the same way a plain `pnpm dev` opens
  a port. `ufw allow in on tailscale0` is an INPUT rule, and INPUT is exactly
  what governs an ordinary listener. `setup-ufw-base` doesn't install
  ufw-docker at all (see [firewall](#firewall)), so there is no DOCKER-USER
  chain and nothing to grant.

Find out in ten seconds rather than trusting the paragraph above — from the
laptop, against a throwaway container on the box:

```bash
# on arch-devbox
docker run -d --name pgtest -p 5432:5432 -e POSTGRES_PASSWORD=x postgres
# from the laptop
nc -vz devbox 5432
```

That should succeed with no firewall change on either side. If it refuses,
check `docker info | grep -i rootless` first — a box that somehow reverted to
rootful docker is back to needing the `ufw-docker allow` grant described
above. Publishing on the tailnet address specifically is still worth doing as
defense in depth, not because it's required here:

```bash
docker run -p "$(tailscale ip -4):5432:5432" postgres
```

A **host** process — `pnpm dev`, or a database installed from pacman — needs
no grant either way; the `tailscale0` rule has always covered it directly.

**Why not the apps' built-in SSH tunnel?** The database already listens on the
tailnet address, so an SSH tunnel adds another connection and authentication
layer without narrowing exposure.

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

Its `README.md` also covers the Ubuntu-specific LAN recovery path and the Vite
`host`/`allowedHosts` settings for reaching dev servers over the tailnet. Shared
Tailscale and sshd rationale now lives in
[`../common/README.md`](../common/README.md#tailscale-and-sshd).
