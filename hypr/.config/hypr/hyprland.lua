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
require("lua.bindings.old")

-- Theme overrides come last so they win over base looknfeel.
require("lua.theme")

hl.config({ ecosystem = { no_update_news = true } })
