# waybar, replaced by quickshell
sudo dnf install quickshell hyprlock hypridle hyprpaper

systemctl --user enable --now hypridle.service
systemctl --user enable --now xdg-desktop-portal-rewrite-launchers.service
