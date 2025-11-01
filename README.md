# dotfiles

## clone only the last commit
```bash
git clone --depth 1 https://github.com/Zihad550/dotfiles
```

## arch setup
1. disk configuration, btrfs with timeshift snapshots
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
sudo pacman -Rs --noconfirm $(pacman -Qtdq) # remove unused
```
sudo nvim /etc/default/grub
# Uncomment to enable booting from LUKS encrypted devices
GRUB_ENABLE_CRYPTODISK=y

grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg

# hyprctl dispatch movetoworkspace special:zellij,title:zellij
