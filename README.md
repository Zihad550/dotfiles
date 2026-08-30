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
~/dotfiles/setup/boot.sh                 # auto-detects distro
~/dotfiles/setup/boot.sh arch-hyprland   # explicit target
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
df-system-update                   # full system update (pacman/yay/flatpak/mise)
```

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
themselves stow-managed symlinks; writes through them land in the repo.

---

## scratch notes

### hyprland dispatch examples

```bash
hyprctl dispatch focuscurrentorlast
hyprctl dispatch fullscreen 0
hyprctl dispatch movewindow u
hyprctl dispatch movetoworkspace special:zellij,title:zellij
hyprctl keyword monitor "eDP-1,preferred,0x1920,1"
```

### remove unused

```bash
flatpak uninstall --unused
yay -Scc                                            # remove cache
sudo rm -rf /var/cache/pacman/pkg/download-*/       # if needed
sudo pacman -Rs --noconfirm $(pacman -Qtdq)         # remove unused
```

### grub / LUKS

```bash
sudo nvim /etc/default/grub
# Uncomment to enable booting from LUKS encrypted devices, not needed if use snapper from archinstall
GRUB_ENABLE_CRYPTODISK=y

grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg
```

### updates

```bash
sudo pacman -Syu
yay -Sua
flatpak update
mise up --bump
zinit update
zinit self-update
aichat --sync-models
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
