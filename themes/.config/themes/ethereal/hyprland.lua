-- Per-theme Hyprland overrides. Loaded via dofile() from ~/.config/hypr/lua/theme.lua.
-- Generated from themes/templates/hyprland.lua.tpl.
local accent = "7d82d9"
local border = "rgb(" .. accent .. ")"

hl.config({
    general = { col = { active_border  = border } },
    group   = { col = { border_active  = border } },
})
