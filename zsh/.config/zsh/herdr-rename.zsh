# Tmux-style automatic tab rename for herdr -- herdr has no built-in
# equivalent of tmux's automatic-rename, so this ports it as a shell hook.
# See docs/adr/0003-tmux-to-herdr.md.
#
# HERDR_ENV/HERDR_TAB_ID are exported into every herdr pane already scoped to
# the right session's socket, so no socket resolution is needed here. Only
# sourced when herdr is installed (see .zshrc).

# Label we last set per tab, keyed by tab id -- lets a manual rename
# (prefix+r) be detected and left alone, mirroring tmux switching
# automatic-rename off for a window once it's renamed by hand.
typeset -gA _herdr_rename_last

_herdr_tab_label() {
    local dir="${PWD:t}" cmd="$1" label
    [[ "$PWD" == "$HOME" ]] && dir="~"
    label="${dir:0:15}"
    [[ -n "$cmd" ]] && label="${label} (${${(z)cmd}[1]:t})"
    print -r -- "${label:0:24}"
}

_herdr_rename_tab() {
    [[ -n "$HERDR_ENV" && -n "$HERDR_TAB_ID" ]] || return

    local label
    label="$(_herdr_tab_label "$1")"
    [[ "$label" == "${_herdr_rename_last[$HERDR_TAB_ID]}" ]] && return

    local current
    current="$(herdr tab get "$HERDR_TAB_ID" 2>/dev/null | jq -r '.result.tab.label // empty')"
    [[ -n "$current" ]] || return

    # Label drifted from what we last set -> renamed by hand since; stop
    # touching it, same as tmux's automatic-rename going off on manual rename.
    if [[ -n "${_herdr_rename_last[$HERDR_TAB_ID]}" && "$current" != "${_herdr_rename_last[$HERDR_TAB_ID]}" ]]; then
        return
    fi

    herdr tab rename "$HERDR_TAB_ID" "$label" >/dev/null 2>&1
    _herdr_rename_last[$HERDR_TAB_ID]="$label"
}

typeset -ga precmd_functions preexec_functions
precmd_functions+=(_herdr_rename_tab)
preexec_functions+=(_herdr_rename_tab)
