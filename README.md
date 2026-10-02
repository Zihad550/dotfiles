# dotfiles

Personal dotfiles for Arch + Hyprland (with Ubuntu / Alpine / arch-gnome variants under `setup/`).
Inspired by [omarchy](https://github.com/basecamp/omarchy) — see `resources/omarchy/` for the upstream reference.

## clone

```bash
# full history
git clone https://github.com/Zihad550/dotfiles ~/dotfiles

# or shallow
git clone --depth 1 https://github.com/Zihad550/dotfiles ~/dotfiles
```

## install

```bash
~/dotfiles/setup/boot.sh                 # pick a target from a menu
~/dotfiles/setup/boot.sh arch-workstation   # explicit target
~/dotfiles/setup/boot.sh --help          # list targets
```

## arch setup notes

1. Disk: btrfs with snapper snapshots
2. Disk encryption (LUKS)

## layout

| Path | Purpose |
|---|---|
| `bin/` | `df-*` user scripts (theme, font, launch, restart helpers) |
| `hypr/` | Hyprland Lua config (entrypoint: `hypr/.config/hypr/hyprland.lua`) |
| `themes/` | Theme palettes + templates (`df-theme-set <name>` switches) |
| `setup/` | Per-distro install scripts; `boot.sh` dispatches |
| `scripts/` | Misc utilities (stow, rclone, syncthing, …) |
| `resources/` | Read-only upstream references (omarchy, Hyprland, devpod, …) |

## common bins

```bash
df-theme-set <name>                # switch theme; no args = show current + list
df-theme-install <git-url> [--apply] [--force]
                                   # clone external theme into ~/.config/themes/
df-theme-remove <name> [--force]   # remove a user-installed theme (refuses built-ins)
df-theme-refresh [--apply]         # regen all themes from current templates
df-theme-colors-from-alacritty <theme-dir>
                                   # derive colors.toml from alacritty.toml
df-theme-set-{vscode,gnome,browser,obsidian}
                                   # per-app theme appliers (called by df-theme-set)

df-font-set <family>               # switch monospace font across configs
df-font-list                       # list installed mono families
df-font-current                    # print current font

df-greeter-refresh                 # reapply the pinned Omarchy SDDM Greeter
df-greeter-reset                   # remove custom Greeter overrides (stock SDDM)
df-boot-branding-set <bg> <fg> <logo.png>
                                   # apply validated colors and logo to boot/login
df-boot-branding-reset              # restore pinned Plymouth and Greeter defaults

df-hypr-display-layout apply [variant]
                                   # restore the saved layout for the connected
                                   # displays; falls back to monitors.lua
df-hypr-display-layout save <variant> [--default]
                                   # capture the current monitor arrangement
df-hypr-display-layout list|show|signature|remove
df-hypr-clamshell                  # reconcile the internal output in clamshell mode
df-hypr-monitor-watch              # recover clamshell state after monitor events

df-launch-tui <cmd>                # launch TUI in ghostty (guards missing bin)
df-launch-app <cmd>                # launch GUI (guards missing bin)
df-cmd-present <cmd>...            # exit 0 if all on PATH
df-harness [codex|claude] [message...] # reply to arguments or stdin
df-commit-message [codex|claude]   # generate a commit message from stdin
df-work-branch-name-gen [codex|claude] <issues> # default: Codex gpt-6-luna, high reasoning
df-system-update                   # full system update (pacman/yay/flatpak/mise)
df-backup [directory]              # select home items and a drive to back up
df-restore [directory]             # select a drive and home items to restore
```

`df-backup` and `df-restore` use Gum to select multiple items and a mounted drive
at or under `/run/media` or `/mnt`. Use X to select items and Enter to
continue. Pass an existing directory to skip the drive picker. Both commands
require `gum`, `tar`, `zstd`, and an interactive terminal.

The backup picker offers existing home items from Documents, Videos, Pictures,
`.gnupg`, `.password-store`, `.ssh`, backups, dev, dotfiles, Downloads, Music,
Templates, `.obsidian-vault`, and `bk.json`. Each selected item gets a separate
`.tar.zst` archive that preserves Unix permissions and symbolic links. SSH and
GnuPG runtime files are excluded, as are development caches and build
output under `dev` and `dotfiles`.

`DOTFILES_PROFILE` must be `arch-workstation` or `arch-devbox`. Filenames include
that profile, such as `arch-workstation-documents-backup.tar.zst` and
`arch-devbox-ssh-backup.tar.zst`. Backup replaces each previous archive only
after creating its replacement successfully. Restore offers only fixed archive
names for the current profile and unpacks all selected archives before changing
home items. Existing home items move into `<item>.pre-restore.<random>/` first.
GnuPG agents are stopped before replacing `.gnupg`.

These two commands replace `df-backup-create`, `df-backup-extract`,
`df-worstation-backup`, `df-ssh-backup`, and `df-gnupg-backup`. Existing archives
remain on disk; timestamped archives and the old workstation archive names
are not offered by the restore picker.

### theme paths

| Path | Contents |
|---|---|
| `~/.config/themes/<name>/` | active theme source (`colors.toml`) + generated outputs |
| `~/.config/theme` | symlink → active `~/.config/themes/<name>/` |
| `~/.config/backgrounds/<name>.<ext>` | per-theme background (primary + `<name>-1.<ext>` extras) |
| `~/.config/theme-previews/<name>.<ext>` | thumbnail shown in the Launcher's Themes Provider |

Built-in themes live in this repo at `themes/.config/themes/<name>/` and are
stowed into `~/.config/themes/` as symlinks. `df-theme-remove` refuses to
delete those — edit the repo instead. Backgrounds/previews directories are
themselves stow-managed symlinks; writes through them land in the repo. The
Arch setup skips their separate repository so a slow clone cannot block the
main install. Before asking whether to restart, it offers to clone the optional
image collection. The desktop uses the theme's background color if you decline
or the clone fails. You can retry later with:

```bash
~/dotfiles/scripts/stow/stow-backgrounds
```

---

## scratch notes

### hyprland dispatch examples

```bash
hyprctl dispatch focuscurrentorlast
hyprctl dispatch fullscreen 0
hyprctl dispatch movewindow u
hyprctl dispatch movetoworkspace special:herdr,title:herdr
hyprctl keyword monitor "eDP-1,preferred,0x1920,1"
```

### remove unused

```bash
flatpak uninstall --unused
yay -Scc                                            # remove cache
sudo rm -rf /var/cache/pacman/pkg/download-*/       # if needed
sudo pacman -Rs --noconfirm $(pacman -Qtdq)         # remove unused
```

### updates

```bash
sudo pacman -Syu
yay -Sua
flatpak update
mise up --bump
zinit update
zinit self-update
```

### misc

```bash
# get architecture of a tool installed via mise
file "$(mise where deno)/bin/deno"

# zsh site-functions / completion files
/usr/share/zsh/site-functions

# probe a port
nc -z -vv localhost 6379

# create a forgejo issue
tea issues create --repo <owner>/<repo> --title "title" --description "desc" --login <login>
```

https://codeberg.org/jehad/dotfiles

`df-harness` defaults to Codex with `gpt-6-luna` and no reasoning effort.
Select Claude with `df-harness claude "your message"` to use Sonnet.
Both run without tools or persistent sessions and print only the final reply.
Use `DF_HARNESS_MODEL`, `DF_HARNESS_REASONING` (Codex only), and
`DF_HARNESS_INSTRUCTIONS` to override the defaults. Use `--` before a message
that begins with a selector or option. Empty input or missing replies fail.
The branch generator uses high Codex reasoning and keeps its
`DF_WORK_BRANCH_MODEL` override; the commit generator supplies commit instructions.
