#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d /opt/dotfiles/.git ]]; then
    echo "arch-desktop: shell is missing; create the VM with --layers shell,arch-desktop" >&2
    exit 1
fi

git clone https://github.com/Zihad550/dotfiles-archive.git ~/dotfiles-archive
