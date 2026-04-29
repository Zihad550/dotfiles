# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.config/zsh/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
# if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
#   source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
# fi

# profiling
# zmodload zsh/zprof

# Set the directory we want to store zinit and plugins
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

# Download Zinit, if it's not there yet
if [ ! -d "$ZINIT_HOME" ]; then
    mkdir -p "$(dirname $ZINIT_HOME)"
    git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source/Load zinit
source "${ZINIT_HOME}/zinit.zsh"

# Add in Powerlevel10k
# zinit ice depth=1; zinit light romkatv/powerlevel10k

# starship
# zinit ice as"command" from"gh-r" \
#     atclone"./starship init zsh > init.zsh; ./starship completions zsh > _starship" \
#     atpull"%atclone" src"init.zsh"
# zinit light starship/starship

# #### mise
# zinit as="command" lucid from="gh-r" for \
#     id-as="usage" \
#     atpull="%atclone" \
#     jdx/usage
# #atload='eval "$(mise activate zsh)"' \

# zinit as="command" lucid from="gh-r" for \
#     id-as="mise" mv="mise* -> mise" \
#     atclone="./mise* completion zsh > _mise" \
#     atpull="%atclone" \
#     atload='eval "$(mise activate zsh)"' \
#     jdx/mise

# pure
# zinit ice compile'(pure|async).zsh' pick'async.zsh' src'pure.zsh'
# zinit light sindresorhus/pure

# Add in zsh plugins
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab
zinit light g-plane/pnpm-shell-completion

# Add in snippets
zinit snippet OMZL::git.zsh
zinit snippet OMZP::git
zinit snippet OMZP::sudo
zinit snippet OMZP::archlinux
# zinit snippet OMZP::aws
zinit snippet OMZP::kubectl
# zinit snippet OMZP::kubectx
zinit snippet OMZP::command-not-found

# Load completions
autoload -Uz compinit && compinit

zinit cdreplay -q

zinit ice atload"zpcdreplay" atclone"./zplug.zsh" atpull"%atclone"

# To customize prompt, run `p10k configure` or edit ~/.config/zsh/.p10k.zsh.
# [[ ! -f ~/.config/zsh/.p10k.zsh ]] || source ~/.config/zsh/.p10k.zsh

# aliases
source "$XDG_CONFIG_HOME/zsh/aliasrc"
source "$XDG_CONFIG_HOME/zsh/zshalias"

##############
# History
###########
HISTSIZE=5000
SAVEHIST=5000
HISTFILE="$XDG_CACHE_HOME/zsh_history" # move histfile to cache
SAVEHIST=$HISTSIZE
HISTDUP=erase
HISTCONTROL=ignoreboth # consecutive duplicates & commands starting with space are not saved
setopt append_history inc_append_history
setopt share_history
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

################
# settings
############
setopt extendedglob nomatch notify
unsetopt beep
setopt autocd               # type a dir to cd
setopt globdots             # include dotfiles
setopt extended_glob        # match ~ # ^
setopt interactive_comments # allow comments in shell
unsetopt prompt_sp          # don't autoclean blanklines

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':completion:*' squeeze-slashes false # explicit disable to allow /*/ expansion
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

#################
# Shell integrations
#################
if command -v fzf >/dev/null 2>&1; then source <(fzf --zsh); fi
if command -v zoxide >/dev/null 2>&1; then eval "$(zoxide init --cmd cd zsh)"; fi
if command -v starship >/dev/null 2>&1; then eval "$(starship init zsh)"; fi
if command -v mise >/dev/null 2>&1; then eval "$(mise activate zsh)"; fi
if command -v procs >/dev/null 2>&1; then source <(procs --gen-completion-out zsh); fi
if command -v kubectl >/dev/null 2>&1; then source <(kubectl completion zsh); fi
if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi
if command -v tv >/dev/null 2>&1; then eval "$(tv init zsh)"; fi
source "$XDG_CONFIG_HOME/zsh/ni"

# everytime i do cd it lists all content of that directory
chpwd() {
    eza -lh --group-directories-first --icons=auto --color=auto

    # activating python virtual environment when i do cd
    # if [[ -d .venv ]]; then
    #     source .venv/bin/activate
    # elif [[ -d venv ]]; then
    #     source venv/bin/activate
    # elif [[ -n "$VIRTUAL_ENV" ]]; then
    #     dactivate
    # fi
}

# advance move, batch moving, batch renaming
autoload -Uz zmv

# Usage examples:
# -i = interactive mode = zmv -i -W '*.txt' '*.log'
# zmv '(*).log' '$1.txt'           # Rename .log to .txt
# zmv -w '*.log' '*.txt'           # Same thing, simpler syntax
# zmv -n '(*).log' '$1.txt'        # Dry run (preview changes)
# zmv -i '(*).log' '$1.txt'        # Interactive mode (confirm each)

# Helpful aliases for zmv
alias zcp='zmv -C' # Copy with patterns
alias zln='zmv -L' # Link with patterns

# -------------------------------------------
# 8. Named Directories - Bookmark Folders
# -------------------------------------------
# Access with ~name syntax, e.g., cd ~yt or ls ~yt
hash -d dot=~/dotfiles
hash -d dl=~/Downloads
hash -d wo=~/dev/work/mamacrm

##################
# keybindings
############
bindkey -e
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region
# open buffer line in editor
autoload -Uz edit-command-line
zle -N edit-command-line
bindkey '^x^e' edit-command-line

# binds
bindkey "^a" beginning-of-line
bindkey "^e" end-of-line
bindkey "^j" backward-word
bindkey "^k" forward-word
bindkey "^H" backward-kill-word

# ctrl J & K for going up and down in prev commands
bindkey "^J" history-search-forward
bindkey "^K" history-search-backward
bindkey '^R' fzf-history-widget

# custom plugins, zle(zshell line editor)
# clear but keep current
clear-keep-buffer() {
    zle clear-screen
}
zle -N clear-keep-buffer
bindkey '^Xl' clear-keep-buffer

# copy current command
copy-command() {
    echo -n $BUFFER | wl-copy
    zle -M "Copied to clipboard"
}
zle -N copy-command
bindkey '^Xc' copy-command

# custom keybindings for searching and opening directories in code editors
zle -N zed_open_dir
bindkey "^e" zed_open_dir
zle -N fzf_open_dir
bindkey "\ec" fzf_open_dir
# search an open on nautilus
zle -N fod
bindkey "^f" fod

# open lazygit
openLazygit() {
    lazygit <$TTY
    zle redisplay
}
zle -N openLazygit
bindkey "^g" openLazygit

# useful custom keybindings for custom autocompletions
bindkey -s '^Xgc' 'git commit -m ""\C-b'
bindkey -s '^Xgp' 'git push'

# profiling
# zprof
