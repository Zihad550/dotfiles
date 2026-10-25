-- Hyprland Lua config entry point.
-- Hyprland prefers this file over hyprland.conf. To roll back, delete or rename it.
-- Reference: resources/Hyprland/src/config/supplementary/jeremy/Jeremy.cpp (LUA_PATHS > CONF_PATHS).

require("lua.helpers")
require("lua.envs")
require("lua.monitors")
require("lua.looknfeel")
require("lua.input")
require("lua.windows")
require("lua.autostart")

require("lua.bindings.system")
require("lua.bindings.apps")
require("lua.bindings.tiling")
require("lua.bindings.media")
require("lua.bindings.clipboard")
require("lua.bindings.utilities")

-- Theme overrides come last so they win over base looknfeel.
require("lua.theme")

hl.config({ ecosystem = { no_update_news = true } })

local state_home = os.getenv("XDG_STATE_HOME")
if not state_home or state_home == "" then
    state_home = os.getenv("HOME") .. "/.local/state"
end
local preferences = state_home .. "/dotfiles/hypr-settings.lua"
local settings_file = io.open(preferences, "r")
if settings_file then
    settings_file:close()
    dofile(preferences)
end
