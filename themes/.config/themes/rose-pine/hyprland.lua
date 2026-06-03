-- Per-theme Hyprland overrides. Loaded via dofile() from lua/theme.lua.
local accent = "56949f"
local border = "rgb(" .. accent .. ")"

hl.config({
    general = { col = { active_border  = border } },
    group   = { col = { border_active  = border } },
})
