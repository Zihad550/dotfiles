local home         = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"
-- Copy / Paste. Uses the down/timer/up workaround for hyprwm/Hyprland#14099
-- (sendshortcut alone can leave the synthetic key stuck/repeating).
o.bind("SUPER + C", "Universal copy", o.send_shortcut_once("CTRL", "Insert"))
o.bind("SUPER + V", "Universal paste", o.send_shortcut_once("SHIFT", "Insert"))
o.bind("SUPER + CTRL + V", "Clipboard manager", dotfiles_bin .. "/df-launch-walker -m clipboard")
