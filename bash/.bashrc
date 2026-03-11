#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Set up fzf key bindings and fuzzy completion
eval "$(fzf --bash)"

source "$XDG_CONFIG_HOME/zsh/aliasrc"

bind -x '"\ec": fzf_open_dir'

PS1='[\u@\h \W]\$ '

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init bash)"; fi
