#!/usr/bin/env bash
# One VM for the whole mamacrm folder (frontend, backend and their worktrees):
# --layers docker,mamacrm. node and go are devvm shared tools; each repo's
# mise.toml installs its own tools. See devvm/README.md.
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
    software-properties-common \
    trash-cli \
    tree \
    unzip \
    zoxide

# Ubuntu renames these to avoid clashes with other packages.
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd

# mise's PPA, as on the Ubuntu devbox, so `apt upgrade` keeps it current.
sudo add-apt-repository -y ppa:jdxcode/mise
sudo apt-get update
sudo apt-get install -y mise

mkdir -p ~/.bashrc.d
cat >~/.bashrc.d/mamacrm.sh <<'EOF'
# Where `go install` (the backend's `just tools::install`) puts its tools.
export PATH="$HOME/go/bin:$PATH"
eval "$(mise activate bash)"
eval "$(zoxide init bash)"
EOF
