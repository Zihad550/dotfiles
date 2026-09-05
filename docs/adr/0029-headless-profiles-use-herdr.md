# Headless profiles use Herdr

The headless carve-out in
[ADR 0003](0003-tmux-to-herdr.md) is superseded. `ubuntu-devbox`, the
`ubuntu-server` setup paths, `alpine`, and Arch devbox use Herdr through the shared
[`setup/common/setup-herdr`](../../setup/common/setup-herdr) installer, and
their stow scripts manage only Herdr's `config.toml`. They no longer install
or stow tmux.

Alpine uses musl while Herdr is distributed as a prebuilt mise-managed release.
The required Alpine-host feasibility check passed: `herdr --version` ran on
the owner's Alpine host without loader or glibc errors. Proxmox is not part of
this migration: its setup paths neither install nor stow tmux.

The desktop profiles' remaining inert tmux fallback is retired separately by
issue #121. Together, that retirement and this migration leave no supported
profile installing or stowing tmux; the old config is retained on
`archive/tmux` rather than in `main`.

## Why

The original carve-out described headless boxes as having no Herdr integration
surface. That boundary no longer matches the repository: the remote boxes run
the same agent workflows, and `ubuntu-devbox` had already linked Herdr's config
while still installing and stowing tmux. Herdr releases are available through
mise on Ubuntu and Alpine and through the Omarchy pacman repository on Arch,
so keeping two multiplexers creates
configuration drift without preserving a useful distinction.

## Shared installer and integration boundary

Each target entrypoint calls the same shared installer. On Ubuntu and Alpine it
installs Herdr via mise. On Arch it requires the Herdr package installed by the
shared pacman list. The installer then registers the existing agent
integrations and does not add a GUI dependency. The integration list stays
unchanged and there is no headless
"lean" mode: no integration has been shown to fail or impose meaningful cost
on a server, and a split list would create an unverified divergence. The
installer is self-contained and non-interactive so it can run inside an
unattended setup sequence.

Both Arch profiles install Herdr from pacman. The package manager now owns the
binary and its upgrades. The package step removes old user-level and
mise-managed Herdr copies because `~/.local/bin` precedes `/usr/bin` on these
profiles and would otherwise hide the pacman binary. Arch devbox still uses
mise for its development tools and for the `skills` CLI; only Herdr's binary
moves to pacman. Arch workstation does not add the integration step as part of
this change.

Only `config.toml` is linked into `~/.config/herdr/`. Herdr's sessions, sockets,
logs and other runtime state stay on the host, as they do on the Arch desktop
profiles.

## Sessions already in flight

The migration does not stop a running tmux server or delete its sessions.
Removing a tmux stow link changes what a future shell loads; it does not kill
work already running. Existing sessions remain available until they are
detached and naturally exit, giving the owner time to move them to Herdr.

## Verification boundary

Installing a binary and linking its config proves wiring, not a working
multiplexer. The owner verified `herdr --version`, a named session,
detach/reattach, and the configured prefix on Ubuntu devbox, Ubuntu server,
and Alpine. The Alpine feasibility check and the per-host runtime checks are
therefore complete.
