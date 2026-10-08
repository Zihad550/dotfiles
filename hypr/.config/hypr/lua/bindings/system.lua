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
o.bind("PRINT",         "Screenshot",        dotfiles_bin .. "/df-capture-screenshot smart copy")
o.bind("SHIFT + PRINT", "Screenshot (edit)", dotfiles_bin .. "/df-capture-screenshot smart edit")
o.bind("SUPER + PRINT", "Color picker", "hyprpicker -a")
o.bind("SUPER + CTRL + PRINT", "Extract text from screen", dotfiles_bin .. "/df-capture-text")

local capture_layers = 0
local capture_binds = {}

hl.on("layer.opened", function(layer)
    if layer.namespace == "selection" then
        capture_layers = capture_layers + 1
        if capture_layers == 1 then
            capture_binds = {
                hl.bind("RETURN", hl.dsp.exec_cmd(dotfiles_bin .. "/df-capture-region --take-window"), { description = "Capture highlighted window" }),
                hl.bind("CTRL + RETURN", hl.dsp.exec_cmd(dotfiles_bin .. "/df-capture-region --take-fullscreen"), { description = "Capture focused monitor" }),
                hl.bind("TAB", hl.dsp.exec_cmd(dotfiles_bin .. "/df-capture-region --select-window next"), { description = "Select next capture window" }),
                hl.bind("CTRL + TAB", hl.dsp.exec_cmd(dotfiles_bin .. "/df-capture-region --select-window prev"), { description = "Select previous capture window" }),
            }
            for _, direction in ipairs({ "left", "right", "up", "down" }) do
                table.insert(capture_binds,
                    hl.bind(direction:upper(), hl.dsp.exec_cmd(dotfiles_bin .. "/df-capture-region --select-window " .. direction),
                        { description = "Select capture window" }))
            end
        end
    end
end)

hl.on("layer.closed", function(layer)
    if layer.namespace == "selection" and capture_layers > 0 then
        capture_layers = capture_layers - 1
        if capture_layers == 0 then
            for _, binding in ipairs(capture_binds) do binding:unbind() end
            capture_binds = {}
        end
    end
end)
