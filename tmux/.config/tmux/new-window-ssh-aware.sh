#!/usr/bin/env bash
# Open a new tmux window. If the current pane is inside an ssh session,
# re-run the same ssh command in the new window so the user stays remote.

pane_tty="${1#/dev/}"
pane_path="$2"
pane_pid="$3"

# Read /proc/<pid>/cmdline (NUL-separated argv) and reprint it safely
# quoted for the shell. Returns the quoted command on stdout if argv[0]
# is ssh (or */ssh), nothing otherwise.
quoted_cmdline_if_ssh() {
    local pid="$1"
    local cmdline_file="/proc/$pid/cmdline"
    [ -r "$cmdline_file" ] || return 1

    # Read NUL-separated args into an array.
    local -a args=()
    while IFS= read -r -d '' arg; do
        args+=("$arg")
    done <"$cmdline_file"

    [ "${#args[@]}" -gt 0 ] || return 1

    case "${args[0]}" in
    ssh | */ssh) ;;
    *) return 1 ;;
    esac

    # Print as a single shell-quoted command line.
    printf '%q' "${args[0]}"
    local i
    for ((i = 1; i < ${#args[@]}; i++)); do
        printf ' %q' "${args[i]}"
    done
    printf '\n'
}

find_ssh() {
    local pid="$1"
    local out
    out=$(quoted_cmdline_if_ssh "$pid") && {
        echo "$out"
        return 0
    }
    local kids kid
    kids=$(pgrep -P "$pid")
    for kid in $kids; do
        find_ssh "$kid" && return 0
    done
    return 1
}

ssh_cmd=$(find_ssh "$pane_pid")

if [ -n "$ssh_cmd" ]; then
    tmux new-window -a "$ssh_cmd"
else
    tmux new-window -a -c "$pane_path"
fi
