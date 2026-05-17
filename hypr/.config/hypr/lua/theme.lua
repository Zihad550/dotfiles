-- Load per-theme overrides if the active theme provides one.
-- Generated from themes/templates/hyprland.lua.tpl per theme.
local lua_path = os.getenv("HOME") .. "/.config/theme/hyprland.lua"

local f = io.open(lua_path, "r")
if f then
    f:close()
    dofile(lua_path)
end
