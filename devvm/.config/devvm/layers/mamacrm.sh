#!/usr/bin/env bash
# One VM for the whole mamacrm folder (frontend, backend and their worktrees):
# --layers docker,mamacrm. devvm's base brings mise and runs node and go as
# shared tools; each repo's mise.toml installs its own tools. See devvm/README.md.
set -euo pipefail

if ! command -v docker &>/dev/null; then
    echo "mamacrm: docker is missing; create the VM with --layers docker,mamacrm" >&2
    exit 1
fi

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    bat \
    curl \
    eza \
    fd-find \
    fzf \
    gcc \
    git \
    git-delta \
    jq \
    lazygit \
    less \
    make \
    postgresql-client \
    ripgrep \
    trash-cli \
    tree \
    unzip \
    zoxide

# Ubuntu renames these to avoid clashes with other packages.
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
