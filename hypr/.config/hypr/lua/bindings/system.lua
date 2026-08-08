local home = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

-- Power / session
--
-- Shutdown, restart, exit and lock dispatch into the running Launcher, which
-- shows a confirmation and runs the command on Return -- see the four
-- "confirm-*" GlobalShortcuts in
-- quickshell/.config/quickshell/launcher/shell.qml and the commands themselves
-- in launcher/lib/power.js, which are the ones these binds used to run.
--
-- **`locked = true` is deliberately dropped from those four.** It let them fire
-- while the session is locked, which a confirmation cannot honour: the Launcher
-- is a layer surface under hyprlock, so the question would be invisible and the
-- keybind would sit waiting for a Return nobody can see to press. Powering off
-- from a locked screen is now the physical power button, or a TTY.
--
-- Reload and Suspend keep their direct binds and their `locked`: neither ends
-- the session, and asking before a suspend is friction with nothing behind it.
o.bind("SUPER + CTRL + SHIFT + S", "Shutdown",         hl.dsp.global("launcher:confirm-shutdown"))
o.bind("SUPER + CTRL + SHIFT + R", "Restart",          hl.dsp.global("launcher:confirm-restart"))
o.bind("SUPER + CTRL + R",         "Reload Hyprland",  "hyprctl reload",   { locked = true })
o.bind("SUPER + CTRL + M",         "Exit Hyprland",    hl.dsp.global("launcher:confirm-logout"))
o.bind("SUPER + CTRL + S",         "Suspend",          "systemctl suspend",{ locked = true })
o.bind("SUPER + CTRL + SHIFT + L", "Lock",             hl.dsp.global("launcher:confirm-lock"))

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
