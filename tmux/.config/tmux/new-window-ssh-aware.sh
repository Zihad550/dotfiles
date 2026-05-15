#!/usr/bin/env bash
# Open a new tmux window. If the current pane is inside an ssh session,
# open a new ssh window to the same host. If the remote shell has reported
# its cwd via OSC 7 (captured by tmux as #{pane_path}), cd to that cwd on
# the far side instead of landing in the directory the original ssh
# invocation used.

pane_tty="${1#/dev/}"
pane_path_local="$2"
pane_pid="$3"

# Single-letter ssh options that consume the next argv element as a value.
SSH_VALUE_FLAGS="BbcDEeFIiJLlmOoPpQRSWw"

# Read argv of a pid as a bash array via /proc/<pid>/cmdline (NUL-separated).
# Result is placed into the global array READ_ARGV.
read_argv() {
    local pid="$1"
    local f="/proc/$pid/cmdline"
    [ -r "$f" ] || return 1
    READ_ARGV=()
    local arg
    while IFS= read -r -d '' arg; do
        READ_ARGV+=("$arg")
    done <"$f"
    [ "${#READ_ARGV[@]}" -gt 0 ]
}

# Walk the process tree under $1 looking for an ssh process. On success,
# echoes the pid.
find_ssh_pid() {
    local pid="$1"
    if read_argv "$pid"; then
        case "${READ_ARGV[0]}" in
        ssh | */ssh)
            echo "$pid"
            return 0
            ;;
        esac
    fi
    local kid
    for kid in $(pgrep -P "$pid" 2>/dev/null); do
        find_ssh_pid "$kid" && return 0
    done
    return 1
}

ssh_pid=$(find_ssh_pid "$pane_pid")

# Non-ssh: just open in the current pane's cwd.
if [ -z "$ssh_pid" ]; then
    tmux new-window -a -c "$pane_path_local"
    exit 0
fi

# We have an ssh process. Read its argv so we can locate the host and
# replace the remote command (or add one if it was just `ssh host`).
read_argv "$ssh_pid" || {
    tmux new-window -a -c "$pane_path_local"
    exit 0
}
SSH_ARGV=("${READ_ARGV[@]}")

# Split argv into pre-host options and host.
declare -a PRE_HOST=()
HOST=""
i=1
while [ "$i" -lt "${#SSH_ARGV[@]}" ]; do
    a="${SSH_ARGV[$i]}"
    if [[ "$a" == -* ]]; then
        PRE_HOST+=("$a")
        # Single-letter option that takes a value: consume next token.
        if [ "${#a}" -eq 2 ] && [[ "$SSH_VALUE_FLAGS" == *"${a:1:1}"* ]]; then
            i=$((i + 1))
            PRE_HOST+=("${SSH_ARGV[$i]}")
        fi
        i=$((i + 1))
        continue
    fi
    HOST="$a"
    break
done

# If we couldn't parse a host, fall back to replaying the original argv.
if [ -z "$HOST" ]; then
    tmux new-window -a "${SSH_ARGV[@]}"
    exit 0
fi

# Ask tmux for the OSC 7 path the remote shell most recently reported.
remote_cwd=$(tmux display-message -p '#{pane_path}' 2>/dev/null)
# tmux may store it as bare path or as a file:// URI. Normalize to /path.
case "$remote_cwd" in
file://*)
    # Strip leading file://<host> (host portion may be empty).
    remote_cwd="/${remote_cwd#file://*/}"
    ;;
esac

# If we have a usable remote cwd, cd to it on the far side. Otherwise
# replay the original ssh argv so we at least don't regress.
if [[ "$remote_cwd" == /* ]]; then
    # Single-quote for the remote shell; escape any embedded single quotes.
    escaped="${remote_cwd//\'/\'\\\'\'}"
    remote_cmd="cd '$escaped' && exec \$SHELL -l"
    # Force -t so the remote shell gets a tty (login shell needs it).
    tmux new-window -a ssh -t "${PRE_HOST[@]}" "$HOST" "$remote_cmd"
else
    tmux new-window -a "${SSH_ARGV[@]}"
fi
