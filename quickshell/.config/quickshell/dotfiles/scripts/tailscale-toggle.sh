#!/usr/bin/env bash

# Brings tailscale up or down for Quick Settings' toggle, driven by
# TailscaleService.toggle(). The status stream (tailscale-status.sh) picks the
# new state up on its own, so nothing is printed for the bar to read.
#
# `tailscale up`/`down` need root unless `tailscale set --operator=$USER` has
# been run, and there is no terminal here to type a sudo password into. So the
# direct call is tried first and only a permission failure falls back to
# pkexec, where hyprpolkitagent (setup/arch-workstation/setup-packages) draws the
# prompt. Errors surface through notify-send, since a menu row that silently
# does nothing is indistinguishable from a broken one.

set -uo pipefail

ACTION="${1:-}"
case "$ACTION" in
   up | down) ;;
   *)
      echo "Usage: tailscale-toggle.sh up|down" >&2
      exit 1
      ;;
esac

notify() {
   notify-send -u critical "Tailscale" "$1"
}

# --timeout because `tailscale up` blocks printing a login URL when the node is
# not authenticated, and nothing here would ever read it.
run() {
   if [[ $ACTION == up ]]; then
      "$@" tailscale up --timeout=20s 2>&1
   else
      "$@" tailscale down 2>&1
   fi
}

if ! command -v tailscale &>/dev/null; then
   notify "tailscale is not installed"
   exit 1
fi

output=$(run) && exit 0

# Everything else (not authenticated, no network, daemon down) is a real
# failure; only a permission problem is worth re-running under pkexec.
if ! grep -qiE "permission denied|access denied|must be root|operator" <<<"$output"; then
   notify "$ACTION failed: $output"
   exit 1
fi

if ! command -v pkexec &>/dev/null; then
   notify "$ACTION needs root, and pkexec is not installed"
   exit 1
fi

output=$(run pkexec) || {
   notify "$ACTION failed: $output"
   exit 1
}
