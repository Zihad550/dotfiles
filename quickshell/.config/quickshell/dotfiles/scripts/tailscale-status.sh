#!/usr/bin/env bash

# Emits one JSON object per line, consumed by TailscaleService.qml.
#
# Moved from waybar/.config/waybar/scripts/tailscale_status.sh, then converted
# from a one-shot script (waybar re-ran it every 10s) into a long-lived stream,
# so state changes show up immediately instead of up to 10s late.
#
# tailscaled has no DBus interface, so there is nothing for quickshell to
# subscribe to directly. `tailscale debug watch-ipn` streams the daemon's IPN
# bus, which is the closest thing available -- but it sits under `debug` and
# carries no stability guarantee.
#
# FUTURE: if a tailscale release promotes an equivalent to a documented
# top-level command (something along the lines of `tailscale status --watch`),
# point WATCH_CMD at it and drop supports_watch_ipn along with the polling
# fallback. Until then the fallback is what keeps this working on versions
# where the debug subcommand is absent or renamed.

set -uo pipefail

WATCH_CMD=(tailscale debug watch-ipn)
POLL_INTERVAL=10

build_status() {
    if ! command -v tailscale &>/dev/null; then
        echo '{"class": "not-installed", "tooltip": "Tailscale not installed"}'
        return
    fi

    local status
    if ! status=$(tailscale status --json 2>/dev/null); then
        echo '{"class": "disconnected", "tooltip": "Tailscale: Unavailable"}'
        return
    fi

    local backend
    if ! backend=$(jq -r '.BackendState // "Unknown"' <<<"$status" 2>/dev/null); then
        echo '{"class": "disconnected", "tooltip": "Tailscale: Unavailable"}'
        return
    fi

    if [[ $backend != Running ]]; then
        jq -cn --arg tooltip "Tailscale: $backend" '{class: "disconnected", tooltip: $tooltip}'
        return
    fi

    local ip
    ip=$(jq -r '.TailscaleIPs[0] // "N/A"' <<<"$status")

    jq -cn --arg tooltip "Tailscale: Running
IP: $ip" '{class: "connected", tooltip: $tooltip}'
}

# The IPN bus is chatty and most events do not change what we display, so only
# emit when the rendered JSON actually differs.
last=""
emit() {
    local json
    json="$(build_status)"
    [[ "$json" == "$last" ]] && return
    last="$json"
    printf '%s\n' "$json"
}

supports_watch_ipn() {
    command -v tailscale &>/dev/null &&
        tailscale debug --help 2>&1 | grep -q 'watch-ipn'
}

emit

if supports_watch_ipn; then
    # Every line is treated purely as a "something changed, re-read status"
    # trigger; the payload is an internal shape we deliberately do not parse.
    # That is also why stderr is merged rather than discarded -- watch-ipn
    # prints "Connected." and it is not documented which stream its output
    # lands on, so dropping stderr risks a pipe that stays open and silent
    # forever. A stray diagnostic line just causes one deduplicated re-read.
    #
    # Process substitution, not a pipe: it keeps `last` in this shell so the
    # dedupe state carries into the fallback loop below.
    while IFS= read -r _; do
        emit
    done < <("${WATCH_CMD[@]}" 2>&1)
fi

# Reached when watch-ipn is unavailable, or when the stream dies (tailscaled
# restart, upgrade). Polling from here keeps the icon live either way.
while true; do
    sleep "$POLL_INTERVAL"
    emit
done
