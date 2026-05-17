local home = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

-- Power / session
o.bind("SUPER + CTRL + SHIFT + S", "Shutdown",         "shutdown now",     { locked = true })
o.bind("SUPER + CTRL + SHIFT + R", "Restart",          "shutdown -r now",  { locked = true })
o.bind("SUPER + CTRL + R",         "Reload Hyprland",  "hyprctl reload",   { locked = true })
o.bind("SUPER + CTRL + M",         "Exit Hyprland",    hl.dsp.exit(),      { locked = true })
o.bind("SUPER + CTRL + S",         "Suspend",          "systemctl suspend",{ locked = true })
o.bind("SUPER + CTRL + SHIFT + L", "Lock",             "hyprlock",         { locked = true })

-- Internal display toggles
o.bind("SUPER + CTRL + D",         "Close eDP-1",      dotfiles_bin .. "/hyprland-close-display eDP-1",    { locked = true })
o.bind("SUPER + CTRL + SHIFT + D", "Close HDMI-A-1",   dotfiles_bin .. "/hyprland-close-display HDMI-A-1", { locked = true })

-- Launchers
o.bind("SUPER + SPACE",      "Walker",           "uwsm-app -- walker")
o.bind("SUPER + SHIFT + P",  "Scripts",          dotfiles_bin .. "/walker/execute-command")
o.bind("SUPER + SHIFT + R",  "Rename workspace", dotfiles_bin .. "/hyprland-rename-workspace")

-- Screenshots
o.bind("PRINT",        "Screenshot",
    [[bash -c 'grim -g "$(slurp -d)" - | tee ~/Pictures/Screenshots/screenshot-$(date +%Y-%m-%d_%H-%M-%S).png | wl-copy']])
o.bind("SHIFT + PRINT", "Screenshot (edit)",
    [[bash -c 'grim -g "$(slurp -d)" - | tee ~/Pictures/Screenshots/screenshot-$(date +%Y-%m-%d_%H-%M-%S).png | swappy -f -']])
o.bind("SUPER + PRINT", "Color picker", "hyprpicker -a")
