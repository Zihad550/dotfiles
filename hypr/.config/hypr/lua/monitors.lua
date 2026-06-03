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
-- hdmi-a-1 (primary, vertical) & eDP-1 (secondary, horizontal)  [ACTIVE]
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
hl.monitor({ output = "eDP-1", mode = "preferred", position = "1080x860", scale = "1" })

-- show workspace 3-10 on monitor hdmi-a-1 (primary)
hl.workspace_rule({ workspace = "3", monitor = "HDMI-A-1", default = true })
for i = 4, 10 do
    hl.workspace_rule({ workspace = tostring(i), monitor = "HDMI-A-1" })
end

-- show workspace 1,2 on monitor eDP-1 (secondary)
hl.workspace_rule({ workspace = "1", monitor = "eDP-1", default = true })
hl.workspace_rule({ workspace = "2", monitor = "eDP-1" })

-- dp-1 (alternate setup — single monitor)
-- hl.workspace_rule({ workspace = "1",  monitor = "DP-1", default = true })
-- hl.workspace_rule({ workspace = "2",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "3",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "4",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "5",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "6",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "7",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "8",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "9",  monitor = "DP-1" })
-- hl.workspace_rule({ workspace = "10", monitor = "DP-1" })


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

-- LAPTOP LID STUFF
-- o.bind("switch:off:Lid Switch", nil,
--     [[hyprctl keyword monitor "eDP-1,preferred,1080x860,1"]], { locked = true })
-- o.bind("switch:on:Lid Switch",  nil, [[hyprctl keyword monitor "eDP-1, disable"]], { locked = true })
-- o.bind("switch:on:Lid Switch",  nil, os.getenv("HOME") .. "/dotfiles/bin/df-hypr-lid-close",  { locked = true })
-- o.bind("switch:off:Lid Switch", nil, os.getenv("HOME") .. "/dotfiles/bin/df-hypr-lid-close",  { locked = true })
