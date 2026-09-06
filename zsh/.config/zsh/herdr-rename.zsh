# Tmux-style automatic tab rename for herdr -- herdr has no built-in
# equivalent of tmux's automatic-rename, so this ports it as a shell hook.
# Agent panes get the agent's own session name instead of the directory.
# See docs/adr/0003-tmux-to-herdr.md and docs/adr/0031-agent-tabs-carry-the-session-name.md.
#
# HERDR_ENV/HERDR_TAB_ID are exported into every herdr pane already scoped to
# the right session's socket, so no socket resolution is needed here. Only
# sourced when herdr is installed (see .zshrc).

# Label we last set for this tab. Kept on disk rather than in a shell variable
# because the watcher below renames the same tab from a separate process: a
# label neither of them wrote is a manual rename (prefix+r) to leave alone,
# mirroring tmux switching automatic-rename off for a hand-named window.
typeset -g _herdr_rename_state="${XDG_RUNTIME_DIR:-/tmp}/herdr-rename-$UID"

# Commands herdr detects as agents -- mirrors the integrations installed by
# setup/common/setup-herdr.
typeset -ga _herdr_agent_commands=(codex claude opencode kilo cursor)

typeset -g _herdr_watch_pid=

_herdr_tab_label() {
    local dir="${PWD:t}" cmd="$1" label
    [[ "$PWD" == "$HOME" ]] && dir="~"
    label="${dir:0:15}"
    [[ -n "$cmd" ]] && label="${label} (${${(z)cmd}[1]:t})"
    print -r -- "${label:0:24}"
}

# What the agent in this pane wants the tab called, or nothing when it has no
# better idea than the directory already gives.
_herdr_agent_label() {
    local pane agent label dir thread
    pane="$(herdr pane current --pane "$HERDR_PANE_ID" 2>/dev/null)" || return
    agent="$(jq -r '.result.pane.agent // empty' <<<"$pane")"
    [[ -n "$agent" ]] || return

    if [[ "$agent" == codex ]]; then
        # Codex reports only a thread id to herdr; the name it shows for that
        # thread lives in its own index, appended to on every rename.
        thread="$(jq -r '.result.pane.agent_session.value // empty' <<<"$pane")"
        [[ -n "$thread" ]] && label="$(grep -F "\"$thread\"" ~/.codex/session_index.jsonl 2>/dev/null |
            tail -1 | jq -r '.thread_name // empty')"
    fi
    # Every other agent puts its own summary in the terminal title.
    [[ -n "$label" ]] || label="$(jq -r '.result.pane.terminal_title_stripped // empty' <<<"$pane")"

    # A bare agent name or the directory we would have shown anyway is not
    # worth overwriting the tmux-style label with.
    dir="$(jq -r '.result.pane.foreground_cwd // .result.pane.cwd // empty' <<<"$pane")"
    [[ -n "$label" && "${label:l}" != "$agent" && "$label" != "${dir:t}" ]] || return

    # Agent names are prose, so drop the word the cap lands inside rather than
    # showing half of it.
    local cut="${label:0:24}"
    [[ "$label" != "$cut" && "${label:24:1}" != " " ]] && cut="${cut% *}"
    print -r -- "$cut"
}

_herdr_apply_tab_label() {
    local desired="$1" state="$_herdr_rename_state/${HERDR_TAB_ID//:/-}"
    [[ -n "$desired" ]] || return

    # herdr's own .number is a never-reused tab_id counter (t5 stays "5"
    # forever), not a tab-bar position -- derive the 1,2,3... position
    # ourselves from where the tab sits in the list instead.
    local info number current
    info="$(herdr tab list 2>/dev/null | jq -r --arg id "$HERDR_TAB_ID" '
        .result.tabs as $tabs
        | ($tabs | to_entries | map(select(.value.tab_id == $id)) | first | .key) as $idx
        | if $idx == null then empty else "\($idx + 1)\t\($tabs[$idx].label)" end
    ')"
    [[ -n "$info" ]] || return
    number="${info%%$'\t'*}"
    current="${info#*$'\t'}"

    # Strip the "N:" prefix we prepend so a tab renumbering (e.g. an earlier
    # tab closing) isn't mistaken for a manual rename below. Match the
    # prefix actually on $current, not the freshly computed $number -- a
    # closed tab shifts $number before $current's stored label catches up.
    local current_label="$current"
    [[ "$current" =~ ^([0-9]+): ]] && current_label="${current#${match[1]}:}"

    local mine=
    [[ -r "$state" ]] && mine="$(<"$state")"

    # Label drifted from what we last set -> renamed by hand since; leave the
    # content alone (automatic-rename off, like tmux), but still keep its "N:"
    # prefix in sync -- tmux renumbers manually-named windows too, it just
    # doesn't touch their name.
    if [[ -n "$mine" && "$current_label" != "$mine" ]]; then
        local renumbered="${number}:${current_label}"
        [[ "$renumbered" != "$current" ]] && herdr tab rename "$HERDR_TAB_ID" "$renumbered" >/dev/null 2>&1
        return
    fi

    # Prefix with the tab's number, tmux-window-list style ("1:dirname").
    local label="${number}:${desired}"
    [[ "$label" != "$current" ]] && herdr tab rename "$HERDR_TAB_ID" "$label" >/dev/null 2>&1
    mkdir -p "$_herdr_rename_state" 2>/dev/null && print -r -- "$desired" >| "$state"
}

# An agent holds the foreground for the whole session, so precmd/preexec never
# run while its name is being decided; herdr exposes no event stream to the
# CLI, so poll for as long as that command runs.
_herdr_watch_agent() {
    local desired last
    while kill -0 $$ 2>/dev/null; do
        sleep 3
        desired="$(_herdr_agent_label)"
        [[ -n "$desired" && "$desired" != "$last" ]] || continue
        _herdr_apply_tab_label "$desired"
        last="$desired"
    done
}

_herdr_rename_tab() {
    [[ -n "$HERDR_ENV" && -n "$HERDR_TAB_ID" ]] || return

    if [[ -n "$_herdr_watch_pid" ]]; then
        kill "$_herdr_watch_pid" 2>/dev/null
        _herdr_watch_pid=
    fi

    _herdr_apply_tab_label "$(_herdr_tab_label "$1")"

    [[ -n "$1" && -n "$HERDR_PANE_ID" ]] || return
    if (( $_herdr_agent_commands[(Ie)${${(z)1}[1]:t}] )); then
        _herdr_watch_agent &!
        _herdr_watch_pid=$!
    fi
}

typeset -ga precmd_functions preexec_functions
precmd_functions+=(_herdr_rename_tab)
preexec_functions+=(_herdr_rename_tab)
