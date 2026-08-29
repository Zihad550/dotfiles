# Esc-Esc toggles a sudo prefix on the current line. On an empty line it pulls
# the last history entry first, so a failed command can be re-run with sudo.
# Editor commands get `sudo -e` (sudoedit) instead of a plain prefix.

_sudo_toggle_replace() {
    local old=$1 new=$2 space=${2:+ }

    # Cursor inside the part being replaced: reposition it after the new text,
    # otherwise it would land mid-token.
    if (( CURSOR <= ${#old} )); then
        BUFFER="${new}${space}${BUFFER#$old }"
        CURSOR=${#new}
    else
        LBUFFER="${new}${space}${LBUFFER#$old }"
    fi
}

sudo-command-line() {
    [[ -z $BUFFER ]] && LBUFFER="$(fc -ln -1)"

    # A leading space keeps the line out of history (hist_ignore_space); strip
    # it for the match and put it back afterwards.
    local whitespace=""
    if [[ ${LBUFFER:0:1} == " " ]]; then
        whitespace=" "
        LBUFFER="${LBUFFER:1}"
    fi

    {
        local editor=${SUDO_EDITOR:-${VISUAL:-$EDITOR}}
        if [[ -z $editor ]]; then
            case "$BUFFER" in
                "sudo -e "*) _sudo_toggle_replace "sudo -e" "" ;;
                "sudo "*) _sudo_toggle_replace "sudo" "" ;;
                *) LBUFFER="sudo $LBUFFER" ;;
            esac
            return
        fi

        local cmd="${${(Az)BUFFER}[1]}"
        # Resolve one level of alias, so `v file` counts as the editor too.
        local realcmd="${${(Az)aliases[$cmd]}[1]:-$cmd}"
        local editorcmd="${${(Az)editor}[1]}"

        # ${var:c} resolves through $PATH, so a bare name and its full path match.
        if [[ "$realcmd" == (\$EDITOR|$editorcmd|${editorcmd:c}) \
            || "${realcmd:c}" == ($editorcmd|${editorcmd:c}) ]]; then
            _sudo_toggle_replace "$cmd" "sudo -e"
            return
        fi

        case "$BUFFER" in
            "$editorcmd "*) _sudo_toggle_replace "$editorcmd" "sudo -e" ;;
            '$EDITOR '*) _sudo_toggle_replace '$EDITOR' "sudo -e" ;;
            "sudo -e "*) _sudo_toggle_replace "sudo -e" "$editor" ;;
            "sudo "*) _sudo_toggle_replace "sudo" "" ;;
            *) LBUFFER="sudo $LBUFFER" ;;
        esac
    } always {
        LBUFFER="${whitespace}${LBUFFER}"
        # zsh-syntax-highlighting needs the redraw to recolour the new prefix.
        zle && zle redisplay
    }
}

zle -N sudo-command-line
bindkey -M emacs '\e\e' sudo-command-line
bindkey -M vicmd '\e\e' sudo-command-line
bindkey -M viins '\e\e' sudo-command-line
