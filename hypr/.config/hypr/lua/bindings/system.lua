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
o.bind("SUPER + CTRL + D",         "Close eDP-1",      dotfiles_bin .. "/df-hypr-close-display eDP-1",    { locked = true })
o.bind("SUPER + CTRL + SHIFT + D", "Close HDMI-A-1",   dotfiles_bin .. "/df-hypr-close-display HDMI-A-1", { locked = true })

-- Launchers
--
-- The primary bind dispatches straight into the running Quickshell process
-- via Quickshell.Hyprland.GlobalShortcut -- no fork, no exec -- registered in
-- quickshell/.config/quickshell/launcher/shell.qml as appid "launcher", name
-- "toggle". `hl.dsp.global`, not the bare `global` dispatcher: this machine
-- runs Hyprland's Lua config layer, which evaluates a bare dispatcher
-- argument as Lua rather than passing it through, so the bare form is a
-- syntax error here.
o.bind("SUPER + SPACE", "Launcher", hl.dsp.global("launcher:toggle"))

-- Screenshots
o.bind("PRINT",        "Screenshot",
    [[bash -c 'grim -g "$(slurp -d)" - | tee ~/Pictures/Screenshots/screenshot-$(date +%Y-%m-%d_%H-%M-%S).png | wl-copy']])
o.bind("SHIFT + PRINT", "Screenshot (edit)",
    [[bash -c 'grim -g "$(slurp -d)" - | tee ~/Pictures/Screenshots/screenshot-$(date +%Y-%m-%d_%H-%M-%S).png | swappy -f -']])
o.bind("SUPER + PRINT", "Color picker", "hyprpicker -a")
