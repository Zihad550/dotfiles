#!/usr/bin/env bash
# Claude Code statusLine command
# 2 lines:
#   1: model [effort] | user ➜ cwd (branch)
#   2: ctx [bar] X% used/total  5h [bar] X% (rem)  7d [bar] X% (rem)

input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
used_tokens=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
total_tokens=$(echo "$input" | jq -r '.context_window.context_window_size // empty')

# Username: prefer GITHUB_USER env var, fall back to whoami
if [ -n "$GITHUB_USER" ]; then
    prompt_username="@${GITHUB_USER}"
else
    prompt_username="$(whoami)"
fi

# Shorten home directory to ~, then truncate to last 4 path components
home="$HOME"
short_cwd="${cwd/#$home/\~}"
component_count=$(echo "$short_cwd" | tr -cd '/' | wc -c)
if [ "$component_count" -ge 4 ]; then
    first=$(echo "$short_cwd" | cut -d'/' -f1)
    last3=$(echo "$short_cwd" | rev | cut -d'/' -f1-3 | rev)
    short_cwd="${first}/…/${last3}"
fi

# Git branch (skip optional lock to avoid conflicts)
git_branch=""
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null \
        || git -C "$cwd" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
    [ -n "$branch" ] && git_branch="($branch) "
fi

# Build a 10-block bar (filled=█ empty=░) for a 0-100 percentage
make_bar() {
    local pct="$1"
    local filled=$(( pct / 10 ))
    [ "$filled" -gt 10 ] && filled=10
    [ "$filled" -lt 0 ] && filled=0
    local empty=$(( 10 - filled ))
    local bar="" i
    for (( i=0; i<filled; i++ )); do bar="${bar}█"; done
    for (( i=0; i<empty;  i++ )); do bar="${bar}░"; done
    printf '%s' "$bar"
}

# Format seconds remaining as compact duration (e.g. 2h15m, 3d4h, 45m)
fmt_remaining() {
    local target="$1"
    [ -z "$target" ] && return
    local target_epoch
    if [[ "$target" =~ ^[0-9]+$ ]]; then
        target_epoch="$target"
    else
        target_epoch=$(date -d "$target" +%s 2>/dev/null) || return
    fi
    local now_epoch diff
    now_epoch=$(date +%s)
    diff=$(( target_epoch - now_epoch ))
    [ "$diff" -le 0 ] && { printf '0m'; return; }
    local d=$(( diff / 86400 ))
    local h=$(( (diff % 86400) / 3600 ))
    local m=$(( (diff % 3600) / 60 ))
    if [ "$d" -gt 0 ]; then printf '%dd%dh' "$d" "$h"
    elif [ "$h" -gt 0 ]; then printf '%dh%dm' "$h" "$m"
    else printf '%dm' "$m"
    fi
}

# Compact token count: 1234 -> 1.2k, 45678 -> 46k, 1234567 -> 1.2M
fmt_tokens() {
    local n="$1"
    [ -z "$n" ] && return
    if [ "$n" -lt 1000 ]; then
        printf '%d' "$n"
    elif [ "$n" -lt 10000 ]; then
        awk -v n="$n" 'BEGIN{printf "%.1fk", n/1000}'
    elif [ "$n" -lt 1000000 ]; then
        awk -v n="$n" 'BEGIN{printf "%.0fk", n/1000}'
    else
        awk -v n="$n" 'BEGIN{printf "%.1fM", n/1000000}'
    fi
}

# Context usage with bar + token count
ctx_part=""
if [ -n "$used_pct" ]; then
    ctx_int=$(printf '%.0f' "$used_pct")
    # Fall back to deriving used tokens from % and actual context window size
    if [ -z "$used_tokens" ] && [ -n "$used_pct" ]; then
        limit="${total_tokens:-200000}"
        used_tokens=$(awk -v p="$used_pct" -v l="$limit" 'BEGIN{printf "%d", p*l/100}')
    fi
    tok_part=""
    if [ -n "$used_tokens" ] && [ -n "$total_tokens" ]; then
        tok_part=" ($(fmt_tokens "$used_tokens")/$(fmt_tokens "$total_tokens"))"
    elif [ -n "$used_tokens" ]; then
        tok_part=" ($(fmt_tokens "$used_tokens"))"
    fi
    ctx_part="ctx [$(make_bar "$ctx_int")] ${ctx_int}%${tok_part}"
fi

# Rate limits (Claude.ai subscribers; absent until first API response)
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
five_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
week_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

limits_part=""
if [ -n "$five_pct" ]; then
    p=$(printf '%.0f' "$five_pct")
    seg="5h [$(make_bar "$p")] ${p}%"
    rem=$(fmt_remaining "$five_reset")
    [ -n "$rem" ] && seg="${seg} (${rem})"
    limits_part="${seg}"
fi
if [ -n "$week_pct" ]; then
    p=$(printf '%.0f' "$week_pct")
    seg="7d [$(make_bar "$p")] ${p}%"
    rem=$(fmt_remaining "$week_reset")
    [ -n "$rem" ] && seg="${seg} (${rem})"
    [ -n "$limits_part" ] && limits_part="${limits_part} | "
    limits_part="${limits_part}${seg}"
fi

# Effort level (shown beside model)
effort=$(echo "$input" | jq -r '.effort.level // empty')
effort_part=""
[ -n "$effort" ] && effort_part=" [${effort}]"

# Extras line (reserved for future things)
extras_part=""

# Colors
C_USER='\033[0;32m'
C_DIR='\033[1;34m'
C_BR='\033[1;36m'
C_MODEL='\033[0;33m'
C_LIM='\033[0;35m'
C_EXTRA='\033[0;36m'
C_R='\033[0m'

# Line 1: model [effort] | user ➜ cwd (branch)
printf "${C_MODEL}%s%s${C_R} | ${C_USER}%s${C_R} ➜ ${C_DIR}%s${C_R} ${C_BR}%s${C_R}" \
    "$model" "$effort_part" "$prompt_username" "$short_cwd" "$git_branch"

# Line 2: ctx + rate limits (only if any present)
line2=""
[ -n "$ctx_part" ] && line2="${ctx_part}"
if [ -n "$limits_part" ]; then
    [ -n "$line2" ] && line2="${line2} | "
    line2="${line2}${limits_part}"
fi
if [ -n "$line2" ]; then
    printf "\n${C_LIM}%s${C_R}" "$line2"
fi
