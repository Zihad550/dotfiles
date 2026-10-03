# shellcheck shell=bash
set -euo pipefail
umask 077

backup_entries=(Documents Videos Pictures .gnupg .password-store .ssh backups dev dotfiles Downloads Downloads/backups Music Templates .obsidian-vault bk.json)

die() {
    printf '%s: %s\n' "$command_name" "$*" >&2
    exit 1
}

item_label() {
    local label=${1#.}
    label=${label//\//-}
    printf '%s\n' "${label,,}"
}

archive_name() {
    printf '%s-%s-backup.tar.zst\n' "$DOTFILES_PROFILE" "$(item_label "$1")"
}

choose_drive() {
    local mounts
    mounts=$(findmnt -rn -o TARGET | grep -E '^(/run/media|/mnt)(/|$)' \
        | while IFS= read -r mount; do printf '%b\n' "$mount"; done || true)
    [[ -n $mounts ]] || die "no mounted media at or under /run/media or /mnt"
    gum choose --header "Select backup drive" <<<"$mounts"
}

choose_entries() {
    local entry pick choices=() picks=() picked
    for entry in "${backup_entries[@]}"; do
        if [[ $operation == backup ]]; then
            [[ -e $HOME/$entry || -L $HOME/$entry ]] || continue
        else
            [[ -f $drive/$(archive_name "$entry") ]] || continue
        fi
        choices+=("$entry")
    done
    [[ ${#choices[@]} -gt 0 ]] || die "no items available to $operation for $DOTFILES_PROFILE"
    picked=$(gum choose --no-limit --ordered --header "Select items to $operation" "${choices[@]}") || exit $?
    [[ -n $picked ]] || exit 0
    mapfile -t picks <<<"$picked"
    # Keep list order so Downloads restores before Downloads/backups.
    selected=()
    for entry in "${choices[@]}"; do
        for pick in "${picks[@]}"; do
            [[ $pick != "$entry" ]] || selected+=("$entry")
        done
    done
    [[ ${#selected[@]} -eq ${#picks[@]} ]] || die "invalid selection"
}

backup_selected() {
    local entry source archive needed free excludes=()
    for entry in "${selected[@]}"; do
        source=$(realpath -m -- "$HOME/$entry")
        case "$drive/" in
            "$source/"*) die "destination must be outside $HOME/$entry" ;;
        esac
        archive="$drive/$(archive_name "$entry")"
        [[ ! -d $archive ]] || die "$archive is a directory"
    done

    work=$(mktemp -d "$drive/.df-backup.XXXXXX")
    for entry in "${selected[@]}"; do
        archive="$drive/$(archive_name "$entry")"
        excludes=()
        case "$entry" in
            dev | dotfiles) excludes=(
                '--exclude=*/node_modules' '--exclude=*/.pnpm-store' '--exclude=*/.next'
                '--exclude=*/.nuxt' '--exclude=*/dist' '--exclude=*/.cache' '--exclude=*/cache'
                '--exclude=*/logs' '--exclude=*/__pycache__' '--exclude=*/.venv' '--exclude=*/venv'
                '--exclude=*/.turbo' '--exclude=*/.svelte-kit' '--exclude=*/.astro'
                '--exclude=*/.build' '--exclude=*/compiled' '--exclude=*/.vercel'
                '--exclude=*/.netlify' '--exclude=*/.output' '--exclude=*/cmake-build-*'
                '--exclude=*.log' '--exclude=*.tmp' '--exclude=*.pyc' '--exclude=*.tsbuildinfo'
                '--exclude=*.o' '--exclude=*.out' '--exclude=*.so' '--exclude=*.dll'
                '--exclude=*.dylib' '--exclude=.DS_Store' '--exclude=Thumbs.db'
            ) ;;
            .ssh) excludes=('--exclude=.ssh/known_hosts.old') ;;
            .gnupg) excludes=('--exclude=.gnupg/S.*' '--exclude=*.lock' '--exclude=.#lk*' '--exclude=.gnupg/crls.d') ;;
        esac
        # Uncompressed size is an upper bound, so too little space only asks.
        needed=$(tar -C "$HOME" "${excludes[@]}" --totals -cf /dev/null "$entry" 2>&1 >/dev/null \
            | sed -n 's/^Total bytes written: \([0-9]*\).*/\1/p') || true
        free=$(df --output=avail -B1 -- "$drive" | tail -n 1)
        if [[ -n $needed ]] && ((needed > free)); then
            gum confirm --default=false \
                "$entry needs up to $(numfmt --to=iec "$needed") but $drive has $(numfmt --to=iec "$free") free. Continue?" \
                || die "not enough space for $entry; previous archive kept"
        fi
        gum spin --show-error --title "Backing up $entry" -- \
            tar -C "$HOME" "${excludes[@]}" --use-compress-program='zstd -q -T0' -cf "$work/archive.tar.zst" "$entry" \
            || die "could not back up $entry; previous archive kept"
        mv -fT -- "$work/archive.tar.zst" "$archive"
        sync "$archive"
        gum style --foreground 2 "Saved $archive"
    done
}

restore_selected() {
    local entry archive target previous stage dir rest extra
    work=$(mktemp -d "$HOME/.df-restore.XXXXXX")
    for entry in "${selected[@]}"; do
        archive="$drive/$(archive_name "$entry")"
        stage="$work/$(item_label "$entry")-stage"
        mkdir "$stage"
        # GNU tar already refuses '..' members and symlink escapes, so the
        # isolated stage only needs a top-level check after one read.
        gum spin --show-error --title "Restoring $entry" -- \
            tar --zstd -xpf "$archive" -C "$stage" \
            || die "could not unpack $archive; existing $entry kept"
        dir=$stage
        rest=$entry
        while :; do
            extra=$(find "$dir" -mindepth 1 -maxdepth 1 ! -name "${rest%%/*}" -print -quit)
            [[ -z $extra ]] || die "$archive contains a path outside $entry"
            [[ $rest == */* ]] || break
            dir+="/${rest%%/*}"
            rest=${rest#*/}
        done
        [[ -e $stage/$entry || -L $stage/$entry ]] || die "$archive has no $entry"
    done

    for entry in "${selected[@]}"; do
        target="$HOME/$entry"
        stage="$work/$(item_label "$entry")-stage"
        if [[ $entry == .gnupg ]]; then
            gpgconf --kill all 2>/dev/null || true
        fi
        previous=
        if [[ -e $target || -L $target ]]; then
            previous=$(mktemp -d "$HOME/$entry.pre-restore.XXXXXX")
            mv -- "$target" "$previous/${entry##*/}"
        fi
        mkdir -p -- "${target%/*}"
        if ! mv -- "$stage/$entry" "$target"; then
            [[ -z $previous ]] || mv -- "$previous/${entry##*/}" "$target"
            die "could not restore $entry"
        fi
        case "$entry" in
            .ssh | .gnupg | .password-store) [[ -L $target ]] || chmod 700 "$target" ;;
        esac
        [[ -z $previous ]] || gum style --foreground 3 "Previous $entry saved in $previous"
        gum style --foreground 2 "Restored $target"
    done
}

home_backup_main() {
    operation=$1
    shift
    command_name="df-$operation"
    case "${1:-}" in
        -h | --help)
            printf 'Usage: %s [directory]\n\nSelect home items and a backup drive with Gum.\nDOTFILES_PROFILE must be arch-workstation or arch-devbox.\n' "$command_name"
            if [[ $operation == backup ]]; then
                printf 'Archives replace the previous backup only after creation succeeds.\n'
            else
                printf 'Restore lists fixed archives for this profile and keeps previous home items aside.\n'
            fi
            return ;;
        -*) die "usage: $command_name [directory]" ;;
    esac
    [[ $# -le 1 ]] || die "usage: $command_name [directory]"
    case "${DOTFILES_PROFILE:-}" in
        arch-workstation | arch-devbox) ;;
        *) die "DOTFILES_PROFILE must be arch-devbox or arch-workstation" ;;
    esac
    local dependency
    for dependency in gum tar zstd; do
        command -v "$dependency" >/dev/null || die "$dependency is required"
    done
    [[ -t 0 ]] || die "run interactively to select items with Gum"
    gum style --border rounded --padding '1 2' --foreground 6 "$command_name" "$DOTFILES_PROFILE"
    drive=${1:-}
    selected=()
    work=
    trap '[[ -z $work ]] || rm -rf -- "$work"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    if [[ $operation == backup ]]; then
        choose_entries
    fi
    [[ -n $drive ]] || drive=$(choose_drive) || exit $?
    [[ -n $drive ]] || exit 0
    [[ -d $drive && -r $drive ]] || die "$drive is not a readable directory"
    drive=$(realpath -- "$drive")
    if [[ $operation == backup ]]; then
        [[ -w $drive ]] || die "$drive is not a writable directory"
        backup_selected
    else
        choose_entries
        restore_selected
    fi
}
