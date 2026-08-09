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

    local desired
    desired="$(_herdr_tab_label "$1")"

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

    # Label drifted from what we last set -> renamed by hand since; stop
    # touching it, same as tmux's automatic-rename going off on manual rename.
    if [[ -n "${_herdr_rename_last[$HERDR_TAB_ID]}" && "$current_label" != "${_herdr_rename_last[$HERDR_TAB_ID]}" ]]; then
        return
    fi

    # Prefix with the tab's number, tmux-window-list style ("1:dirname").
    local label="${number}:${desired}"
    [[ "$label" != "$current" ]] && herdr tab rename "$HERDR_TAB_ID" "$label" >/dev/null 2>&1
    _herdr_rename_last[$HERDR_TAB_ID]="$desired"
}

typeset -ga precmd_functions preexec_functions
precmd_functions+=(_herdr_rename_tab)
preexec_functions+=(_herdr_rename_tab)
