#!/usr/bin/env bash

# Entrypoint for first-time setup.
#   ./boot.sh             pick a target from a menu
#   ./boot.sh <target>    run it directly (e.g. arch-workstation, arch-devbox)
#   ./boot.sh --help      list targets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prints the entrypoint of a setup directory; fails when it has none. Each
# directory picks its own filename.
entrypoint() {
   local entry
   for entry in init init.sh setup-gnome applications.sh; do
      if [[ -f "$1/$entry" ]]; then
         echo "$entry"
         return 0
      fi
   done
   return 1
}

# Setup directories that have an entrypoint, the running distro's first.
targets() {
   local id="" d name rest=()
   # shellcheck disable=SC1091
   [[ -r /etc/os-release ]] && id="$(. /etc/os-release && echo "$ID")"
   for d in "$SCRIPT_DIR"/*/; do
      name="$(basename "$d")"
      entrypoint "$d" >/dev/null || continue
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
   local entry

   if [[ ! -d "$dir" ]] || ! entry="$(entrypoint "$dir")"; then
      echo "Error: '$target' is not a setup target" >&2
      list_targets
      exit 1
   fi

   "$SCRIPT_DIR/common/check-machine-profile" "$target"
   echo "Running: $dir/$entry"
   exec "$dir/$entry"
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
