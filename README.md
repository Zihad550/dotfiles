# dotfiles

## clone only the last commit
```bash
git clone --depth 1 https://github.com/Zihad550/dotfiles
```

## arch setup
1. disk configuration, btrfs with snapper snapshots
2. disk encryption

## notes hyprland

```bash
 hyprctl dispatch focuscurrentorlast
 hyprctl dispatch fullscreen 0
 hyprctl dispatch focuscurrentorlast
 hyprctl dispatch fullscreen 0
 hyprctl dispatch movewindow u
```

## remove unused
```bash
flatpak uninstall --unused
yay -Scc # remove cache
sudo rm -rf /var/cache/pacman/pkg/download-*/ # if needed by the privious one
sudo pacman -Rs --noconfirm $(pacman -Qtdq) # remove unused
```

```sh
sudo nvim /etc/default/grub
# Uncomment to enable booting from LUKS encrypted devices
GRUB_ENABLE_CRYPTODISK=y

grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg

hyprctl dispatch movetoworkspace special:zellij,title:zellij

# get architecture of a installed tool, installed by mise
file "$(mise where deno)/bin/deno"

# zsh site-functions, completion files
/usr/share/zsh/site-functions
```

# updates
```bash
sudo pacman -Syu
yay -Sua
flatpak update
mise up --bump
zinit update
zinit self-update
aichat --sync-models
```

# nc - connect network
nc -z -vv localhost 6379

hyprctl keyword monitor "eDP-1,preferred,1080x860,1"

tea issues create --repo <owner>/<repo> --title "test issue title" --description "test issue description" --login <login-name>
