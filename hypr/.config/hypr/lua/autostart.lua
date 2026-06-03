-- Autostart necessary processes (notifications daemons, status bars, etc.)
-- o.exec_on_start("uwsm-app -- mako")
-- o.exec_on_start(os.getenv("HOME") .. "/.local/bin/dimmer")
-- hl.bind / hyprctl dispatch workspace 1 equivalent:
-- o.exec_on_start("hyprctl dispatch workspace 1")
-- o.exec_on_start("exec ssh-agent zsh")
-- o.exec_on_start("/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1")
o.exec_on_start("uwsm-app -- walker --gapplication-service")
o.exec_on_start("uwsm-app -- swayosd-server")
o.exec_on_start("uwsm-app -- swaybg -i " .. os.getenv("HOME") .. "/.config/theme/background -m fill")
-- o.exec_on_start("uwsm-app -- hyprlauncher -d")

-- custom apps
o.exec_on_start(os.getenv("HOME") .. "/dotfiles/bin/df-startup-apps")

-- Slow app launch fix -- set systemd vars
o.exec_on_start("sh -c 'systemctl --user import-environment $(env | cut -d= -f1)'")
o.exec_on_start("dbus-update-activation-environment --systemd --all")
