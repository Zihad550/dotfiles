# Interactive routing into existing VMs. See devvm/README.md "Automatic entry".
[[ -o interactive ]] || return 0

autoload -Uz add-zsh-hook

_df_devvm_leave() {
    [[ -n ${DF_DEVVM_AUTO_ROOT:-} && -n ${DF_DEVVM_AUTO_RETURN:-} ]] || return 0
    [[ $PWD == "$DF_DEVVM_AUTO_ROOT" || $PWD == "${DF_DEVVM_AUTO_ROOT%/}/"* ]] && return 0
    printf '%s\0' "$PWD" > "$DF_DEVVM_AUTO_RETURN" || return 0
    exit
}

if [[ -n ${DF_DEVVM_AUTO_ROOT:-} ]]; then
    _df_devvm_prompt() {
        [[ $PROMPT == '(devvm) '* ]] || PROMPT="(devvm) $PROMPT"
    }
    add-zsh-hook chpwd _df_devvm_leave
    add-zsh-hook precmd _df_devvm_prompt
    return 0
fi

# The shell layer sets DEVVM_ZSH; devvm-tools.sh also exists in base-only VMs.
[[ -z ${DEVVM_ZSH:-} && ! -f /etc/profile.d/devvm-tools.sh ]] || return 0

typeset -g _DF_DEVVM_LAST='' _DF_DEVVM_PAUSED=''

_df_devvm_auto() {
    [[ -t 0 && -t 1 && ${DEVVM_AUTO_ENTER:-1} != 0 ]] || return 0
    [[ ! -e ${XDG_CONFIG_HOME:-$HOME/.config}/devvm/no-auto-enter ]] || return 0
    [[ $PWD != "$_DF_DEVVM_LAST" ]] || return 0
    _DF_DEVVM_LAST=$PWD
    if [[ -n $_DF_DEVVM_PAUSED ]]; then
        [[ $PWD != "$_DF_DEVVM_PAUSED" && $PWD != "${_DF_DEVVM_PAUSED%/}/"* ]] || return 0
        _DF_DEVVM_PAUSED=''
    fi
    (( $+commands[devvm] && $+commands[df-devvm-auto] )) || return 0
    local ancestor=$PWD root result destination
    while true; do
        [[ ! -e "$ancestor/.devvm-no-auto" ]] || return 0
        [[ $ancestor != / ]] || break
        ancestor=${ancestor:h}
    done
    root=$(df-devvm-auto resolve "$PWD" 2>/dev/null) || return 0
    result=$(mktemp) || return 0
    _DF_DEVVM_PAUSED=$root
    print -u2 -- "Entering devvm for $root (exit returns to this host shell)"
    df-devvm-auto enter "$PWD" "$result"
    if IFS= read -r -d '' destination < "$result" && [[ -d $destination ]]; then
        builtin cd -q -- "$destination"
    fi
    rm -f -- "$result"
    if [[ $PWD != "$root" && $PWD != "${root%/}/"* ]]; then
        _DF_DEVVM_PAUSED=''
    fi
    _DF_DEVVM_LAST=$PWD
}

# After exit, stay on the host until leaving the VM root or explicitly entering.
devvm-auto-enter() {
    _DF_DEVVM_LAST=''
    _DF_DEVVM_PAUSED=''
    _df_devvm_auto
}

add-zsh-hook chpwd _df_devvm_auto
add-zsh-hook precmd _df_devvm_auto
