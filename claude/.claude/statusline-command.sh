#!/usr/bin/env bash
# Claude Code statusLine command (Nerd Font glyphs)
# 2 lines:
#   1: <robot> model effort · user <folder> cwd <branch> branch
#   2: ctx ━━━─── X% USED/total · 5h ━━─── X% ↻ rem · 7d ━━─── X% ↻ rem
# Meters turn green → yellow → red as usage crosses 50% and 80%. For ctx the
# bold USED token count carries that color and the percentage is dimmed.

input=$(cat)

# One jq pass; \x1f keeps empty fields from collapsing under `read`. jq rounds
# so bash never parses decimals (locale-safe).
IFS=$'\x1f' read -r cwd model effort ctx_pct ctx_used ctx_size \
    five_pct five_reset week_pct week_reset < <(
    jq -r '[
        (.workspace.current_dir // .cwd // ""),
        (.model.display_name // "Claude"),
        (.effort.level // ""),
        (.context_window.used_percentage | if . then round else "" end),
        # total_input_tokens is cumulative across the session, so derive window usage from %.
        (.context_window | if .used_percentage then
            (.used_percentage * (.context_window_size // 200000) / 100 | round) else "" end),
        (.context_window.context_window_size // 200000),
        (.rate_limits.five_hour.used_percentage | if . then round else "" end),
        (.rate_limits.five_hour.resets_at // ""),
        (.rate_limits.seven_day.used_percentage | if . then round else "" end),
        (.rate_limits.seven_day.resets_at // "")
    ] | map(tostring | gsub("[\n\u001f]"; " ")) | join("\u001f")' <<<"$input" 2>/dev/null
)
model="${model:-Claude}"

I_MODEL=$'\xf3\xb0\x9a\xa9'
I_DIR=$'\xef\x81\xbc'
I_BRANCH=$'\xee\x82\xa0'

C_R=$'\033[0m'
C_DIM=$'\033[2m'
C_BOLD=$'\033[1m'
C_MODEL=$'\033[1;33m'
C_USER=$'\033[32m'
C_DIR=$'\033[1;34m'
C_BR=$'\033[36m'
C_OK=$'\033[32m'
C_WARN=$'\033[33m'
C_HOT=$'\033[31m'
SEP="${C_DIM} · ${C_R}"

prompt_username="${GITHUB_USER:+@$GITHUB_USER}"
prompt_username="${prompt_username:-${USER:-$(whoami)}}"

# Shorten home to ~, then keep the root plus the last 3 components.
case "$cwd" in
    "$HOME") short_cwd="~" ;;
    "$HOME"/*) short_cwd="~${cwd#"$HOME"}" ;;
    *) short_cwd="$cwd" ;;
esac
IFS=/ read -ra parts <<<"$short_cwd"
if [ "${#parts[@]}" -gt 4 ]; then
    short_cwd="${parts[0]}/…/${parts[-3]}/${parts[-2]}/${parts[-1]}"
fi

branch=""
if [ -n "$cwd" ]; then
    branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null \
        || git -C "$cwd" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
fi

# Sets REPLY to the threshold color for a 0-100 percentage.
pct_color() {
    if (( $1 >= 80 )); then REPLY="$C_HOT"
    elif (( $1 >= 50 )); then REPLY="$C_WARN"
    else REPLY="$C_OK"
    fi
}

# Sets REPLY to a 10-cell bar plus the percentage (in pct_style, default the bar color).
meter() {
    local pct="$1" pct_style="$2" color filled fill rest
    pct_color "$pct"; color="$REPLY"
    filled=$(( pct / 10 ))
    (( filled > 10 )) && filled=10
    (( filled < 0 )) && filled=0
    printf -v fill '%*s' "$filled" ''
    printf -v rest '%*s' "$(( 10 - filled ))" ''
    REPLY="${color}${fill// /━}${C_DIM}${rest// /─}${C_R} ${pct_style:-$color}${pct}%${C_R}"
}

# Compact duration until a reset timestamp (epoch or date string): 3d4h, 2h15m, 45m.
fmt_remaining() {
    local target="$1" target_epoch diff d h m
    [ -z "$target" ] && return
    if [[ "$target" =~ ^[0-9]+$ ]]; then
        target_epoch="$target"
    else
        target_epoch=$(date -d "$target" +%s 2>/dev/null) || return
    fi
    diff=$(( target_epoch - EPOCHSECONDS ))
    (( diff <= 0 )) && { printf '0m'; return; }
    d=$(( diff / 86400 )); h=$(( diff % 86400 / 3600 )); m=$(( diff % 3600 / 60 ))
    if (( d > 0 )); then printf '%dd%dh' "$d" "$h"
    elif (( h > 0 )); then printf '%dh%dm' "$h" "$m"
    else printf '%dm' "$m"
    fi
}

# 1234 -> 1.2k, 45678 -> 46k, 1234567 -> 1.2M
fmt_tokens() {
    local n="$1" t
    if (( n < 1000 )); then printf '%d' "$n"
    elif (( n < 9950 )); then t=$(( (n + 50) / 100 )); printf '%d.%dk' $(( t / 10 )) $(( t % 10 ))
    elif (( n < 999500 )); then printf '%dk' $(( (n + 500) / 1000 ))
    else t=$(( (n + 50000) / 100000 )); printf '%d.%dM' $(( t / 10 )) $(( t % 10 ))
    fi
}

# Line 1
line1="${C_MODEL}${I_MODEL} ${model}${C_R}"
[ -n "$effort" ] && line1+=" ${C_DIM}${effort}${C_R}"
line1+="${SEP}${C_USER}${prompt_username}${C_R}"
[ -n "$short_cwd" ] && line1+=" ${C_DIR}${I_DIR} ${short_cwd}${C_R}"
[ -n "$branch" ] && line1+=" ${C_BR}${I_BRANCH} ${branch}${C_R}"
printf '%s' "$line1"

# Line 2: context + rate limits (rate limits are absent until the first API response)
segments=()
if [ -n "$ctx_pct" ]; then
    pct_color "$ctx_pct"; ctx_color="$REPLY"
    meter "$ctx_pct" "$C_DIM"
    seg="${C_DIM}ctx${C_R} ${REPLY} ${C_BOLD}${ctx_color}$(fmt_tokens "$ctx_used")${C_R}"
    seg+="${C_DIM}/$(fmt_tokens "$ctx_size")${C_R}"
    segments+=("$seg")
fi

limit_segment() {
    local name="$1" pct="$2" reset="$3" seg rem
    [ -z "$pct" ] && return
    meter "$pct"
    seg="${C_DIM}${name}${C_R} ${REPLY}"
    rem=$(fmt_remaining "$reset")
    [ -n "$rem" ] && seg+=" ${C_DIM}↻ ${rem}${C_R}"
    segments+=("$seg")
}
limit_segment 5h "$five_pct" "$five_reset"
limit_segment 7d "$week_pct" "$week_reset"

if [ "${#segments[@]}" -gt 0 ]; then
    printf '\n'
    for i in "${!segments[@]}"; do
        (( i > 0 )) && printf '%s' "$SEP"
        printf '%s' "${segments[$i]}"
    done
fi
