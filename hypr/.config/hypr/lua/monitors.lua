-- All monitors (default fallback rule)
hl.monitor({ output = "", mode = "preferred", position = "0x0", scale = "auto" })
-- hl.monitor({ output = "eDP-1",    mode = "1920x1080", position = "auto", scale = "1" })  -- eDP-1
-- hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "0x0",  scale = "auto" }) -- hdmi-a-1
hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x0", scale = "1" })


----------------------------------
-- hdmi-a-1 (primary, horizontal)
----------------------------------
-- hl.monitor({ output = "eDP-1", disabled = true })


----------------------------------
-- hdmi-a-1 (primary, vertical) & eDP-1 (secondary, vertical)
----------------------------------
-- hl.monitor({ output = "HDMI-A-1", mode = "1920x1080@75", position = "0x0",  scale = "1" })
-- hl.monitor({ output = "eDP-1",    mode = "1920x1080",    position = "auto", scale = "1" })

-- -- show workspace 2-10 on monitor hdmi-a-1 (primary)
-- hl.workspace_rule({ workspace = "name:2",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:3",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:4",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:5",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:6",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:7",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:8",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:9",  monitor = "HDMI-A-1" })
-- hl.workspace_rule({ workspace = "name:10", monitor = "HDMI-A-1" })

-- -- show workspace 1 on monitor eDP-1 (secondary)
-- hl.workspace_rule({ workspace = "name:1", monitor = "eDP-1" })


----------------------------------
-- hdmi-a-1 (primary, vertical, top) & eDP-1 (secondary, horizontal, below)  [ACTIVE]
----------------------------------
hl.monitor({
    output        = "HDMI-A-1",
    mode          = "1920x1080@75",
    position      = "0x0",
    scale         = "1",
    transform     = 1,
    -- equivalent to legacy addreserved=340 top, 40 bottom
    reserved_area = { top = 340, bottom = 40, left = 0, right = 0 },
})
-- hl.monitor({ output = "HDMI-A-1", reserved_area = { top = 200, bottom = 80, left = 0, right = 0 } })  -- alt: addreserved 200 80 0 0
-- HDMI-A-1 is rotated, so it spans 1080x1920 from 0x0; eDP-1 starts where it ends.
hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x1920", scale = "1" })

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

if has_laptop_chassis() then
    -- show workspace 3-10 on monitor hdmi-a-1 (primary)
    hl.workspace_rule({ workspace = "3", monitor = "HDMI-A-1", default = true })
    for i = 4, 10 do
        hl.workspace_rule({ workspace = tostring(i), monitor = "HDMI-A-1" })
    end

    -- show workspace 1,2 on monitor eDP-1 (secondary)
    hl.workspace_rule({ workspace = "1", monitor = "eDP-1", default = true })
    hl.workspace_rule({ workspace = "2", monitor = "eDP-1" })
else
    hl.workspace_rule({ workspace = "1", monitor = "DP-1", default = true })
    for i = 2, 10 do
        hl.workspace_rule({ workspace = tostring(i), monitor = "DP-1" })
    end
end

----------------------------------------------
-- eDP-1 (primary) & hdmi-a-1 (secondary)
----------------------------------------------

-- show workspace 1 on monitor hdmi-a-1 (secondary)
-- hl.workspace_rule({ workspace = "name:1", monitor = "HDMI-A-1" })

-- show workspace 2-10 on monitor eDP-1 (primary)
-- hl.workspace_rule({ workspace = "name:2",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:3",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:4",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:5",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:6",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:7",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:8",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:9",  monitor = "eDP-1" })
-- hl.workspace_rule({ workspace = "name:10", monitor = "eDP-1" })

-- Omarchy-style transient monitor toggle. The clamshell helper writes this
-- state file before reloading Hyprland, so the compositor owns output removal
-- and the workspace evacuation that follows it.
local clamshell_flag = (os.getenv("XDG_STATE_HOME") or (os.getenv("HOME") .. "/.local/state"))
    .. "/hypr/internal-monitor-clamshell.lua"
local clamshell_file = io.open(clamshell_flag, "r")
if clamshell_file then
    clamshell_file:close()
    dofile(clamshell_flag)
end
