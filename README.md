# dotfiles

Portable shell, Git, editor, terminal, and agent configuration, plus CLI helpers
and the DevVM shell and skills bootstrap.

The Hyprland/Quickshell desktop, themes, Arch desktop installers, and their
tests live in [arch-desktop](https://github.com/Zihad550/arch-desktop). Retired
installers live in [dotfiles-archive](https://github.com/Zihad550/dotfiles-archive).

## Set up a machine

Every machine starts here:

```sh
git clone https://github.com/Zihad550/dotfiles.git ~/dotfiles
~/dotfiles/setup/boot.sh               # pick a target from a menu
~/dotfiles/setup/boot.sh <target>      # e.g. ubuntu-lxc-devbox, arch-workstation
```

`arch-workstation` and `arch-devbox` clone arch-desktop to `ARCH_DESKTOP_DIR`
(default `~/arch-desktop`) and continue with its installer. The other targets
run from `setup/` here and do not need arch-desktop.

## Clone and link

```sh
git clone --depth 1 https://github.com/Zihad550/dotfiles.git ~/dotfiles
~/dotfiles/scripts/stow/stow-base
```

The linking step requires GNU Stow and preserves the existing handling of
runtime-owned Herdr, Worktrunk, DevVM, and local mise configuration. Install
needed command-line tools through the host installer or your environment.

## DevVM

The shell layer shallow-clones this repo to `/opt/dotfiles` and links its shell
configuration. It does not clone or require arch-desktop. See
[DevVM](devvm/README.md) for skills, settings, and existing VM migration.

## Layout

- Tool-named directories contain portable configuration.
- `bin/` and `scripts/` contain portable command-line helpers.
- `setup/` contains the headless installers (`ubuntu-devbox`,
  `ubuntu-lxc-devbox`, `ubuntu-server`, `proxmox`), the `boot.sh` entry point,
  and the shared helpers in `setup/common/`, which arch-desktop also calls.
- `setup/devvm/` and `setup/common/setup-skills` are the portable agent bootstrap.
- `tests/` verifies the portable configuration and helpers.
- `docs/` contains operating guides and agent workflow instructions.

## Checks

```sh
python -m unittest discover -s tests/dev -p 'test_*.py'
node --test --test-isolation=none tests/multiplexer/*.test.js tests/dotfiles/*.test.js tests/setup/*.test.js
```

Specs and task evidence live in GitHub Issues. Keep operating instructions in
the repository, without a second copy of issue specifications.
