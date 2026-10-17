# Reset terminal modes after SSH exits, then reconnect established interactive
# sessions after a transport failure. Remote commands are never replayed.
_ssh_disarm() {
    printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?1004l\e[?1049l\e[?25h'
}

_ssh_interactive() {
    local -a ssh_arguments
    local argument letters resolved
    local destination="" options_done=""
    local value_options='BbcDEeFIiJLlmOoPpQRSWw'
    local index

    ssh_arguments=("$@")
    while (( $# )); do
        argument=$1
        shift

        if [[ -z $options_done && $argument == -- ]]; then
            options_done=1
        elif [[ -z $options_done && $argument == -?* ]]; then
            letters=${argument#-}
            for ((index = 1; index <= ${#letters}; index++)); do
                if [[ $value_options == *${letters[index]}* ]]; then
                    ((index == ${#letters})) && shift
                    break
                fi
            done
        elif [[ -z $destination ]]; then
            destination=$argument
        else
            return 1
        fi
    done

    [[ -n $destination ]] || return 1
    resolved=$(command ssh -G "${ssh_arguments[@]}" 2>/dev/null) || return 1
    ! grep -i '^remotecommand ' <<<"$resolved" | grep -qvi '^remotecommand none$'
}

ssh() {
    local status started=$SECONDS

    command ssh "$@"
    status=$?

    [[ -t 1 ]] || return $status
    _ssh_disarm

    if ((status != 255)) || [[ ! -t 0 ]] || ! _ssh_interactive "$@" ||
        ((SECONDS - started < 30)); then
        return $status
    fi

    (
        while true; do
            print -r -- 'Connection lost. Reconnecting (Ctrl-C to stop)...'
            sleep 2
            command ssh "$@"
            status=$?
            _ssh_disarm
            ((status == 255)) || exit $status
        done
    )
}
