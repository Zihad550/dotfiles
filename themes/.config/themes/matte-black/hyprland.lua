-- Per-theme Hyprland overrides. Loaded via dofile() from lua/theme.lua.
local accent = "e68e0d"
local border = "rgb(" .. accent .. ")"

hl.config({
    general = { col = { active_border  = border } },
    group   = { col = { border_active  = border } },
})
