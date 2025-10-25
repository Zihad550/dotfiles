# profiling
# zmodload zsh/zprof

# ZSH Configuration
# Basic Settings
setopt extendedglob nomatch notify
unsetopt beep
bindkey -v

# Efficient completion initialization
# disable $fpath verification for faster completion system load, and faster startup
# ZSH_DISABLE_COMPAUDIT=true


# load modules
# Completion System
zstyle :compinstall filename "$XDG_CONFIG_HOME/zsh/.zshrc"

autoload -Uz compinit && compinit -C
# autoload -U colors && colors
# autoload -U tetris

# cmp opts
zstyle :compinstall filename "$XDG_CONFIG_HOME/zsh/.zshrc"
zstyle ':completion:*' menu select # tab opens cmp menu
#zstyle ':completion:*' special-dirs true # force . and .. to show in cmp menu
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS} ma=0\;33 # colorize cmp menu
#zstyle ':completion:*' file-list true # more detailed list
zstyle ':completion:*' squeeze-slashes false # explicit disable to allow /*/ expansion

# main opts
setopt auto_menu menu_complete # autocmp first menu match
setopt autocd # type a dir to cd
setopt auto_param_slash # when a dir is completed, add a / instead of a trailing space
setopt no_case_glob no_case_match # make cmp case insensitive
setopt globdots # include dotfiles
setopt extended_glob # match ~ # ^
setopt interactive_comments # allow comments in shell
unsetopt prompt_sp # don't autoclean blanklines
stty stop undef # disable accidental ctrl s

# history opts
HISTSIZE=10000
SAVEHIST=10000
HISTFILE="$XDG_CACHE_HOME/zsh_history" # move histfile to cache
HISTCONTROL=ignoreboth # consecutive duplicates & commands starting with space are not saved
# on exit, history appends rather than overwrites; history is appended as soon as cmds executed; history shared across sessions
setopt append_history inc_append_history share_history # better history

# Tools Configuration
source <(fzf --zsh)

# Tool Initializations
# eval "$(fnm env --use-on-cd --shell zsh)"
eval "$(zoxide init --cmd cd zsh)"
eval "$(starship init zsh)"
eval "$(mise activate zsh)"

# zinit as="command" lucid from="gh-r" for \
#     id-as="usage" \
#     atpull="%atclone" \
#     jdx/usage
    #atload='eval "$(mise activate zsh)"' \

# zinit as="command" lucid from="gh-r" for \
#     id-as="mise" mv="mise* -> mise" \
#     atclone="./mise* completion zsh > _mise" \
#     atpull="%atclone" \
#     atload='eval "$(mise activate zsh)"' \
#     jdx/mise


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

# open fff file manager with ctrl f
# openyazi() {
#  yazi <$TTY
#  zle redisplay
# }
# zle -N openyazi
# bindkey '^f' openyazi




## set up prompt
# NEWLINE=$'\n'
# dark1=#292735
# dark2=#313244
# dark3=#45475a
# dark4="#4a4c61"
# prompt_text_color=#cdd6f4

# function get_env_info() {
#     # Python (virtualenv or conda)
#     if [[ -n "$VIRTUAL_ENV" ]]; then
#         echo -n "%K{$dark4}%F{#89b4fa} [py $(python --version 2>&1 | cut -d' ' -f2)]%f%k"
#     elif [[ -n "$CONDA_DEFAULT_ENV" ]]; then
#         echo -n "%K{$dark4}%F{#89b4fa} [conda $CONDA_DEFAULT_ENV]%f%k"
#     fi

#     # Node.js
#     if [ -f "package.json" ] || [ -d "node_modules" ]; then
#         echo -n "%K{$dark4}%F{#a6e3a1} node $(node -v 2>/dev/null) %f%k"
#     fi

#     # Rust
#     if [ -f "Cargo.toml" ]; then
#         echo -n "%K{$dark4}%F{#f9e2af} [rust $(rustc --version 2>/dev/null | cut -d' ' -f2)]%f%k"
#     fi

#     # Go
#     if [ -f "go.mod" ] || [ -f "main.go" ]; then
#         echo -n "%K{$dark4}%F{#74c7ec} [go $(go version 2>/dev/null | cut -d' ' -f3 | sed 's/go//')]%f%k"
#     fi
# }


# function get_git_branch_and_status() {
#     local branch=$(git branch --show-current 2> /dev/null)
#     if [[ -n $branch ]]; then
#         local changes_added=$(git diff --numstat | awk '{sum += $1} END {print sum}')
#         local changes_deleted=$(git diff --numstat | awk '{sum += $2} END {print sum}')
#         local untracked=$(git ls-files --others --exclude-standard | wc -l)
#         local status_info=""

#         # Add the changes info if there are any changes
#         if [[ $changes_added -gt 0 || $changes_deleted -gt 0 || $untracked -gt 0 ]]; then
#             [[ $((changes_added + untracked)) -gt 0 ]] && status_info+="%F{#a6e3a1}+$((changes_added + untracked))"
#             [[ $changes_deleted -gt 0 ]] && status_info+="%F{#f38ba8}-$changes_deleted"
#         fi

#         echo "%K{$dark3}%F{$prompt_text_color} $branch $status_info %f%k"
#     fi
# }

# setopt PROMPT_SUBST
# NEWLINE=$'\n'
# PROMPT='${NEWLINE}%K{$dark1}%F{#cdd6f4}$(date +%_I:%M%P) %K{$dark2}%F{#cdd6f4} %~ $(get_git_branch_and_status)%f%k$(get_env_info)${NEWLINE}❯ '

# echo -e "${NEWLINE}\033[48;2;46;52;64;38;2;216;222;233m $0 \033[0m\033[48;2;59;66;82;38;2;216;222;233m $(uptime -p | cut -c 4-) \033[0m\033[48;2;76;86;106;38;2;216;222;233m $(uname -r) \033[0m"

# Plugin Sources
# source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
# shell completions
source /usr/share/zsh/plugins/pnpm-shell-completion/pnpm-shell-completion.zsh
source "$XDG_CONFIG_HOME/zsh/aliasrc"
source "$XDG_CONFIG_HOME/zsh/ni"



# custom keybindings for searching and opening directories in code editors
zle -N zed
bindkey "^e" zed
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

openZellij() {
    # zellij <$TTY
    dotfiles-zellij-f
    zle redisplay
}
zle -N openZellij
bindkey "^z" openZellij


# profiling
# zprof
