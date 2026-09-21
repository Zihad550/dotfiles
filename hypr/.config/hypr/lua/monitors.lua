local function has_laptop_chassis()
    local chassis_file = io.open("/sys/class/dmi/id/chassis_type", "r")
    if not chassis_file then
        return false
    end

    local chassis = tonumber(chassis_file:read("*l"))
    chassis_file:close()
    return chassis == 8 or chassis == 9 or chassis == 10 or chassis == 14
        or chassis == 30 or chassis == 31 or chassis == 32
end

local function connected_external_monitor()
    local command = [[
for status in /sys/class/drm/*/status; do
    [ -f "$status" ] && [ "$(cat "$status")" = connected ] || continue
    output=${status%/status}
    output=${output##*/}
    output=${output#*-}
    case "$output" in
        eDP-*|LVDS-*|DSI-*) ;;
        *) printf '%s\n' "$output"; break ;;
    esac
done
]]
    local pipe = io.popen(command, "r")
    if not pipe then
        return nil
    end

    local output = pipe:read("*l")
    pipe:close()
    if output and output:match("^[%w._-]+$") then
        return output
    end
    return nil
end

local function assign_workspaces(monitor)
    hl.workspace_rule({ workspace = "1", monitor = monitor, default = true })
    for i = 2, 10 do
        hl.workspace_rule({ workspace = tostring(i), monitor = monitor })
    end
end

-- Unknown display sets use this layout. Saved layouts override it after startup.
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })

if has_laptop_chassis() then
    local external = connected_external_monitor()
    if external then
        hl.monitor({ output = external, mode = "preferred", position = "0x0", scale = "auto" })
        hl.monitor({ output = "eDP-1", mode = "preferred", position = "auto", scale = "1" })
        -- Internal keeps only workspace 1; the external takes 2-10 and shows 2.
        hl.workspace_rule({ workspace = "1", monitor = "eDP-1", default = true })
        hl.workspace_rule({ workspace = "2", monitor = external, default = true })
        for i = 3, 10 do
            hl.workspace_rule({ workspace = tostring(i), monitor = external })
        end
    else
        hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x0", scale = "1" })
        assign_workspaces("eDP-1")
    end
else
    assign_workspaces("DP-1")
end

local state_home = os.getenv("XDG_STATE_HOME") or (os.getenv("HOME") .. "/.local/state")
-- The clamshell helper writes a temporary rule that must win over the base layout.
local clamshell_flag = state_home .. "/hypr/internal-monitor-clamshell.lua"
local clamshell_file = io.open(clamshell_flag, "r")
if clamshell_file then
    clamshell_file:close()
    dofile(clamshell_flag)
end
