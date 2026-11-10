#!/usr/bin/env bash

# Entrypoint for first-time setup.
#   ./boot.sh             pick a target from a menu
#   ./boot.sh <target>    run it directly (e.g. arch-workstation, arch-devbox)
#   ./boot.sh --help      list targets
#
# Arch desktop targets live in arch-desktop; they are cloned to
# ARCH_DESKTOP_DIR (default ~/arch-desktop) and run from there.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCH_TARGETS=(arch-workstation arch-devbox)

is_arch_target() {
   local name
   for name in "${ARCH_TARGETS[@]}"; do
      [[ "$1" == "$name" ]] && return 0
   done
   return 1
}

# Setup directories that have an entrypoint, the running distro's first.
targets() {
   local id="" init name names=("${ARCH_TARGETS[@]}") rest=()
   # shellcheck disable=SC1091
   [[ -r /etc/os-release ]] && id="$(. /etc/os-release && echo "$ID")"
   for init in "$SCRIPT_DIR"/*/init; do
      names+=("$(basename "$(dirname "$init")")")
   done
   for name in "${names[@]}"; do
      if [[ -n "$id" && "$name" == "$id"* ]]; then
         echo "$name"
      else
         rest+=("$name")
      fi
   done
   printf '%s\n' "${rest[@]}"
}

list_targets() {
   echo "Available targets:"
   targets | sed 's/^/  - /'
}

dispatch() {
   local target="$1"
   local dir="$SCRIPT_DIR/$target"

   if is_arch_target "$target"; then
      dispatch_arch "$target"
   fi
   if [[ "$target" == */* || ! -f "$dir/init" ]]; then
      echo "Error: '$target' is not a setup target" >&2
      list_targets
      exit 1
   fi

   "$SCRIPT_DIR/common/check-machine-profile" "$target"
   echo "Running: $dir/init"
   exec "$dir/init"
}

dispatch_arch() {
   local arch_desktop="${ARCH_DESKTOP_DIR:-$HOME/arch-desktop}"

   if [[ ! -e "$arch_desktop" ]]; then
      git clone https://github.com/Zihad550/arch-desktop.git "$arch_desktop"
   fi
   if [[ ! -x "$arch_desktop/setup/boot.sh" ]]; then
      echo "Error: $arch_desktop is not an arch-desktop checkout" >&2
      exit 1
   fi
   echo "Running: $arch_desktop/setup/boot.sh $1"
   DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)" exec "$arch_desktop/setup/boot.sh" "$1"
}

menu() {
   local options name
   mapfile -t options < <(targets)
   PS3="Setup to run (number): "
   select name in "${options[@]}"; do
      [[ -n "$name" ]] && dispatch "$name"
      echo "Pick a number from 1 to ${#options[@]}." >&2
   done
   exit 1 # stdin closed without a choice
}

case "${1:-}" in
   -h | --help)
      list_targets
      ;;
   "")
      # From /dev/tty, so the menu also works when this script is piped in.
      if ! { : </dev/tty; } 2>/dev/null; then
         echo "No terminal for the menu; pass a target:" >&2
         list_targets
         exit 1
      fi
      menu </dev/tty
      ;;
   *)
      dispatch "$1"
      ;;
esac
