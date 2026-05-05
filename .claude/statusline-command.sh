#!/usr/bin/env bash
# Claude Code statusLine command
# Mirrors a Starship-style prompt: user@host dir [git] | model context%

input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Shorten home directory to ~
home="$HOME"
short_cwd="${cwd/#$home/\~}"

# Git branch (skip optional lock to avoid conflicts)
git_branch=""
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null \
        || git -C "$cwd" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
    [ -n "$branch" ] && git_branch=" $(printf '\xef\x9c\xa6') $branch"
fi

# Context usage indicator
ctx_part=""
if [ -n "$used_pct" ]; then
    ctx_int=$(printf '%.0f' "$used_pct")
    ctx_part=" | ctx ${ctx_int}%"
fi

# Effort level (if present)
effort=$(echo "$input" | jq -r '.effort.level // empty')
effort_part=""
[ -n "$effort" ] && effort_part=" [$effort]"

# Rate limit usage (Claude.ai subscribers only; absent until first API response)
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
limits_part=""
if [ -n "$five_pct" ] || [ -n "$week_pct" ]; then
    [ -n "$five_pct" ] && limits_part="${limits_part} 5h:$(printf '%.0f' "$five_pct")%"
    [ -n "$week_pct" ] && limits_part="${limits_part} 7d:$(printf '%.0f' "$week_pct")%"
fi

printf '\033[0;34m%s\033[0m\033[0;32m%s\033[0m\033[0;35m%s\033[0m\n\033[0;33m%s%s\033[0m%s' \
    "$short_cwd" \
    "$git_branch" \
    "$limits_part" \
    "$model" \
    "$effort_part" \
    "$ctx_part"
