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
    atuin \
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
    ncurses-term \
    neovim \
    postgresql-client \
    ripgrep \
    starship \
    trash-cli \
    tree \
    unzip \
    zoxide \
    zsh

# Ubuntu renames these to avoid clashes with other packages.
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
# Ghostty sets TERM=xterm-ghostty, but Ubuntu names its entry only "ghostty".
# Without one, zsh can't move the cursor back and redraws typed letters twice.
sudo mkdir -p /etc/terminfo/x
sudo ln -sf /usr/share/terminfo/g/ghostty /etc/terminfo/x/xterm-ghostty

# The host's zsh setup, from this repo. Run `git -C /opt/dotfiles pull` in the
# VM to pick up newer config.
d=/opt/dotfiles
sudo git clone --depth 1 https://github.com/Zihad550/dotfiles.git "$d"
sudo chown -R "$(id -u):$(id -g)" "$d"
mkdir -p ~/.config/zsh-devvm ~/.bashrc.d
ln -snf "$d" ~/dotfiles
ln -snf "$d/zsh/.config/zsh" ~/.config/zsh
ln -snf "$d/starship/.config/starship" ~/.config/starship
ln -snf "$d/atuin/.config/atuin" ~/.config/atuin
# For ssh and VS Code terminals; devvm itself always opens bash, see zz-zsh.sh.
sudo chsh -s /usr/bin/zsh "$(id -un)"

cat >~/.zshenv <<'EOF'
. "$HOME/dotfiles/zsh/.zshenv"
# Go stays in devvm's ~/go, where `just tools::install` puts the backend's
# tools, and docker reads devvm's ~/.docker/config.json.
unset GOPATH GOBIN GOMODCACHE DOCKER_CONFIG
# This folder's .zshrc loads the real one, then adds devvm's bash-only hooks.
export ZDOTDIR="$HOME/.config/zsh-devvm"
EOF

cat >~/.config/zsh-devvm/.zshrc <<'EOF'
export DEVVM_ZSH=1
emulate sh -c '. /etc/profile.d/devvm-tools.sh'
ZDOTDIR="$XDG_CONFIG_HOME/zsh"
. "$ZDOTDIR/.zshrc"
# Restored so a zsh started from this one reads ~/.zshenv's wrapper too.
export ZDOTDIR="$HOME/.config/zsh-devvm"

# devvm's ~/.bashrc.d hooks, for zsh: the blocked-request notice and the
# (devvm) prompt prefix.
if [[ -r ~/.bashrc.d/devvm-blocked.sh ]]; then
    emulate sh -c '. ~/.bashrc.d/devvm-blocked.sh'
    unset PROMPT_COMMAND
    precmd_functions+=(_devvm_blocked)
fi
_devvm_prompt() { [[ $PROMPT == '(devvm) '* ]] || PROMPT="(devvm) $PROMPT"; }
precmd_functions+=(_devvm_prompt)
EOF

# devvm opens bash whatever the login shell is, so its interactive shell hands
# over to zsh. bash -c (agents, scripts) and a bash started from zsh stay bash.
cat >~/.bashrc.d/zz-zsh.sh <<'EOF'
if [[ $- == *i* && -t 0 && -z ${BASH_EXECUTION_STRING:-} && -z ${DEVVM_ZSH:-} ]] && command -v zsh >/dev/null; then
    exec zsh
fi
EOF

# The same aliases in bash, for a bash started from zsh.
cat >~/.bashrc.d/dotfiles-aliases.sh <<'EOF'
for f in shell-utils aliasrc gitrc; do
    . "/opt/dotfiles/zsh/.config/zsh/$f"
done
unset f
EOF
