-- Shared helpers. Defines the global `o` table consumed by all bindings/*.lua modules
-- (same convention as resources/omarchy/default/hypr/helpers.lua).

o = o or {}

local function shell_quote(value)
    return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

o.shell_quote = shell_quote

-- Wrap hl.bind so callers can pass a description and a dispatcher OR a shell command string.
function o.bind(keys, description, dispatcher, options)
    local opts = options or {}
    if description and description ~= "" then
        opts.description = description
    end
    if type(dispatcher) == "string" then
        dispatcher = hl.dsp.exec_cmd(dispatcher)
    end
    hl.bind(keys, dispatcher, opts)
end

-- Run a command at Hyprland start (replaces exec-once).
function o.exec_on_start(command)
    hl.on("hyprland.start", function()
        hl.exec_cmd(command)
    end)
end

-- Universal-clipboard / send_shortcut workaround for hyprwm/Hyprland#14099.
-- The single-call hl.dsp.send_shortcut can leave the synthetic key stuck/repeating, so we
-- explicitly emit a press, wait 50ms, then emit a release.
function o.send_shortcut_once(mods, key)
    return function()
        hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "down", window = "activewindow" }))
        hl.timer(function()
            hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "up", window = "activewindow" }))
        end, { timeout = 50, type = "oneshot" })
    end
end
