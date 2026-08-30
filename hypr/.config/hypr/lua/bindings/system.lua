local home = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

-- Power / session
--
-- Shutdown and restart go through df-power, which confirms via the Launcher
-- when unlocked and runs it directly when the Session Lock is up -- so they
-- carry `locked`. Exit and Lock have no locked path and are Launcher-only:
-- that asymmetry is the decision, not an oversight. See
-- docs/adr/0015-power-keybinds-reachable-while-locked.md.
o.bind("SUPER + CTRL + SHIFT + S", "Shutdown",         dotfiles_bin .. "/df-power shutdown", { locked = true })
o.bind("SUPER + CTRL + SHIFT + R", "Restart",          dotfiles_bin .. "/df-power restart",  { locked = true })
o.bind("SUPER + CTRL + R",         "Reload Hyprland",  "hyprctl reload",   { locked = true })
o.bind("SUPER + CTRL + M",         "Exit Hyprland",    hl.dsp.global("launcher:confirm-logout"))
o.bind("SUPER + CTRL + S",         "Suspend",          "systemctl suspend",{ locked = true })
o.bind("SUPER + CTRL + SHIFT + L", "Lock",             hl.dsp.global("launcher:confirm-lock"))

-- Internal display toggles
o.bind("SUPER + CTRL + D",         "Close eDP-1",      dotfiles_bin .. "/df-hypr-close-display eDP-1",    { locked = true })
o.bind("SUPER + CTRL + SHIFT + D", "Close HDMI-A-1",   dotfiles_bin .. "/df-hypr-close-display HDMI-A-1", { locked = true })

-- Lid / clamshell
-- A closed lid with an external display stays awake while the monitor helper
-- disables eDP-1; Hyprland evacuates its workspaces. A lid close without an
-- external display starts the Session Lock before logind performs suspend.
o.bind("switch:on:Lid Switch",  "Lid close", dotfiles_bin .. "/df-system-lid-close", { locked = true })
o.bind("switch:off:Lid Switch", "Lid open",  dotfiles_bin .. "/df-hypr-clamshell",    { locked = true })

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
