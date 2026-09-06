#!/usr/bin/env bash

# Distro-detecting entrypoint for first-time setup.
# Reads /etc/os-release ID and dispatches to the matching setup directory.
# Override with: ./boot.sh <target>      (e.g. arch-workstation, ubuntu, alpine)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

list_targets() {
   echo "Available targets:"
   for d in "$SCRIPT_DIR"/*/; do
      name="$(basename "$d")"
      case "$name" in
         # Not install targets: shared assets and code used by the real ones.
         systemd|common) ;;
         *) echo "  - $name" ;;
      esac
   done
}

dispatch() {
   local target="$1"
   local dir="$SCRIPT_DIR/$target"

   if [[ ! -d "$dir" ]]; then
      echo "Error: setup directory '$target' not found" >&2
      list_targets
      exit 1
   fi

   # Each distro dir picks its own entrypoint filename. Try common ones.
   for entry in init init.sh setup-gnome applications.sh; do
      if [[ -x "$dir/$entry" || -f "$dir/$entry" ]]; then
         echo "Running: $dir/$entry"
         exec "$dir/$entry"
      fi
   done

   echo "Error: no recognized entrypoint in $dir (looked for: init, init.sh, setup-gnome, applications.sh)" >&2
   exit 1
}

if [[ -n $1 ]]; then
   case "$1" in
      -h|--help) list_targets; exit 0 ;;
      *) dispatch "$1" ;;
   esac
fi

if [[ ! -r /etc/os-release ]]; then
   echo "Cannot read /etc/os-release; pass target explicitly:"
   list_targets
   exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release

case "$ID" in
   arch)
      if pacman -Qi hyprland >/dev/null 2>&1 || command -v Hyprland >/dev/null 2>&1; then
         dispatch arch-workstation
      elif pacman -Qi gnome-shell >/dev/null 2>&1; then
         dispatch arch-gnome
      else
         echo "Arch detected. Pick a target:"
         list_targets
         exit 1
      fi
      ;;
   ubuntu)        dispatch ubuntu ;;
   alpine)        dispatch alpine ;;
   debian)        dispatch ubuntu ;;   # close enough; override if you split later
   *)
      echo "Unrecognized distro: $ID. Pick a target:"
      list_targets
      exit 1
      ;;
esac
