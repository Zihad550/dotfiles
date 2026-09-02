-- Autostart necessary processes (notifications daemons, status bars, etc.)
-- o.exec_on_start(os.getenv("HOME") .. "/.local/bin/dimmer")
-- hl.bind / hyprctl dispatch workspace 1 equivalent:
-- o.exec_on_start("hyprctl dispatch workspace 1")
-- o.exec_on_start("exec ssh-agent zsh")
-- o.exec_on_start("/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1")
-- -n is quickshell's --no-duplicate: an autostart firing twice refuses rather
-- than becoming a second instance. See GitHub issue #33.
o.exec_on_start("uwsm-app -- quickshell -c dotfiles -n")
-- The Launcher, as its own instance so that filtering a large provider cannot
-- stall the bar's rendering and a fault in it cannot take the notification
-- daemon down. See quickshell/.config/quickshell/launcher/shell.qml.
o.exec_on_start("uwsm-app -- quickshell -c launcher -n")
-- The Session Lock, as a third instance for the same reason the Launcher is a
-- second one: `df-qs-restart dotfiles` exists to be used, and restarting the
-- bar must not be able to drop a live lock.
-- See quickshell/.config/quickshell/lock/shell.qml.
o.exec_on_start("uwsm-app -- quickshell -c lock -n")
o.exec_on_start("uwsm-app -- " .. os.getenv("HOME") .. "/dotfiles/bin/df-hypr-monitor-watch")
-- Feeds cliphist, which the Launcher's clipboard Provider reads (ticket 14);
-- cliphist keeps no history unless something pipes changes into it.
--
-- Two watchers, not one: a single unqualified `wl-paste --watch` negotiates
-- exactly one mime type per change, so a "Copy Image" offering both image/png
-- and text/html could be captured as the text. Pinning one watcher per type
-- captures both independently.
o.exec_on_start("uwsm-app -- wl-paste --type text --watch cliphist store")
o.exec_on_start("uwsm-app -- wl-paste --type image --watch cliphist store")
o.exec_on_start("uwsm-app -- swaybg -i " .. os.getenv("HOME") .. "/.config/theme/background -m fill")
-- o.exec_on_start("uwsm-app -- hyprlauncher -d")

-- Restore the saved monitor layout for whatever displays are connected. Falls back
-- to the rules in monitors.lua when nothing is saved for this display set, so this
-- file stays the source of truth for unknown setups.
o.exec_on_start(os.getenv("HOME") .. "/dotfiles/bin/df-hypr-display-layout apply --quiet")

-- custom apps
o.exec_on_start(os.getenv("HOME") .. "/dotfiles/bin/df-startup-apps")

-- Slow app launch fix -- set systemd vars
o.exec_on_start("sh -c 'systemctl --user import-environment $(env | cut -d= -f1)'")
o.exec_on_start("dbus-update-activation-environment --systemd --all")
