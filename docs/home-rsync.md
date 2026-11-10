# Home rsync

`df-rsync` sends or receives selected home items over SSH. Each item uses
the same home-relative path on both machines and gets its own rsync invocation
with `-avhP --delete-after`.

The item list matches `df-backup`, plus `.backup.hc` and `.recovery.hc`.
Send offers existing local items before choosing a remote. Receive chooses
a remote first, then offers existing items from that remote's home.
Files such as `bk.json` and the `.hc` containers are selectable too.

Both directions show the remote and selected items and require confirmation
before overwriting destination files or deleting destination-only files within
selected directories. Transfers stop on the first failure.

Exclusions match `df-backup`, including development caches and generated files
for `dev` and `dotfiles`, SSH `known_hosts.old`, and GnuPG runtime files.

Remotes come from concrete SSH aliases in `~/.ssh/config`. A custom remote
prompts for IP, user, and port. Blank user and port use SSH defaults.
Included SSH config files are scanned too. Wildcards, negated host patterns,
and aliases outside letters, digits, `_`, `.`, and `-` (or starting with `.`
or `-`) are omitted; SSH itself resolves each alias's connection settings.
Config lines that cannot be parsed, such as an unbalanced quote, are skipped.

Run `df-rsync` for the operation picker, or `df-rsync send` / `df-rsync receive`
to choose the direction directly. Both machines need rsync, and the local
machine needs Gum, SSH, and Python 3. The command works on either machine profile.

Excluded destination files are retained. Transfers preserve source symlinks,
but refuse existing destination symlinks for an item or its parent directory,
so deletions cannot follow them into another folder. Destination parents are
created when missing. The item order puts `Downloads` before `Downloads/backups`.

The shared item list and exclusions live in `scripts/backup/home-items.sh`.
`df-workstation-dev-sync` keeps its separate development exclusions and fixed
devbox source.
