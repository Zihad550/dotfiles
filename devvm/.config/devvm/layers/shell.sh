#!/usr/bin/env bash
# The host's shell in a VM: CLI tools, this repo's zsh, starship and atuin
# config, and zsh as the interactive shell. Goes below project layers, such as
# --layers docker,shell,mamacrm. See devvm/README.md.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    atuin \
    bat \
    curl \
    eza \
    fd-find \
    fzf \
    git \
    git-delta \
    jq \
    lazygit \
    less \
    ncurses-term \
    neovim \
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

# This repo, for the zsh setup. Run `git -C /opt/dotfiles pull` in the VM to
# pick up newer config.
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
# The host's .zshenv moves Go and docker config under XDG folders; in the VM
# they stay where devvm's PATH and ~/.docker/config.json expect them.
unset GOPATH GOBIN GOMODCACHE DOCKER_CONFIG
# devvm's PATH (~/go/bin, mise shims). bash gets it from BASH_ENV; zsh -c,
# such as an ssh command, reads only this file.
emulate sh -c '. /etc/profile.d/devvm-tools.sh'
# This folder's .zshrc loads the real one, then adds devvm's bash-only hooks.
export ZDOTDIR="$HOME/.config/zsh-devvm"
EOF

cat >~/.config/zsh-devvm/.zshrc <<'EOF'
export DEVVM_ZSH=1
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
