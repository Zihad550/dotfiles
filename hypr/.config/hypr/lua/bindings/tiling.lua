local home = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

-- Close windows
o.bind("SUPER + W",         "Close window",      hl.dsp.window.close())
o.bind("CTRL + ALT + DELETE", "Close all windows", dotfiles_bin .. "/df-hypr-window-close-all")

-- Control tiling
o.bind("SUPER + ALT + slash", "Toggle window split", hl.dsp.layout("togglesplit"))
o.bind("SUPER + ALT + P",     "Pseudo window",       hl.dsp.window.pseudo())
o.bind("SUPER + ALT + T",     "Toggle floating",     hl.dsp.window.float({ action = "toggle" }))
o.bind("SUPER + ALT + F",     "Full screen",         hl.dsp.window.fullscreen({ mode = "fullscreen" }))
o.bind("SUPER + CTRL + F",    "Tiled full screen",   hl.dsp.window.fullscreen_state({ internal = 0, client = 2 }))
o.bind("SUPER + SHIFT + F",   "Full width",          hl.dsp.window.fullscreen({ mode = "maximized" }))
o.bind("SUPER + ALT + L",     "Toggle workspace layout", dotfiles_bin .. "/df-hypr-workspace-layout-toggle")

-- Move focus (vim keys)
o.bind("SUPER + h", "Move focus left",  hl.dsp.focus({ direction = "l" }))
o.bind("SUPER + l", "Move focus right", hl.dsp.focus({ direction = "r" }))
o.bind("SUPER + k", "Move focus up",    hl.dsp.focus({ direction = "u" }))
o.bind("SUPER + j", "Move focus down",  hl.dsp.focus({ direction = "d" }))

-- Move window (use swap instead of move below)
-- o.bind("SUPER + SHIFT + h", "Move window left",  hl.dsp.window.move({ direction = "l" }))
-- o.bind("SUPER + SHIFT + l", "Move window right", hl.dsp.window.move({ direction = "r" }))
-- o.bind("SUPER + SHIFT + k", "Move window up",    hl.dsp.window.move({ direction = "u" }))
-- o.bind("SUPER + SHIFT + j", "Move window down",  hl.dsp.window.move({ direction = "d" }))

-- Swap active window with the one next to it
o.bind("SUPER + SHIFT + h", "Swap window left",  hl.dsp.window.swap({ direction = "l" }))
o.bind("SUPER + SHIFT + l", "Swap window right", hl.dsp.window.swap({ direction = "r" }))
o.bind("SUPER + SHIFT + k", "Swap window up",    hl.dsp.window.swap({ direction = "u" }))
o.bind("SUPER + SHIFT + j", "Swap window down",  hl.dsp.window.swap({ direction = "d" }))

-- Workspace switching (code:10 = key 1, ... code:19 = key 0)
for i = 1, 10 do
    local code = tostring(i + 9)
    o.bind("SUPER + code:" .. code,         "Switch to workspace " .. i,    hl.dsp.focus({ workspace = tostring(i) }))
    o.bind("SUPER + SHIFT + code:" .. code, "Move window to workspace " .. i, hl.dsp.window.move({ workspace = tostring(i) }))
end

-- Workspace navigation
o.bind("SUPER + TAB",        "Next workspace",     hl.dsp.focus({ workspace = "e+1" }))
o.bind("SUPER + SHIFT + TAB","Previous workspace", hl.dsp.focus({ workspace = "e-1" }))
o.bind("SUPER + CTRL + TAB", "Former workspace",   hl.dsp.focus({ workspace = "previous" }))

-- Cycle apps on active workspace
o.bind("ALT + TAB",         "Cycle next window",  hl.dsp.window.cycle_next())
o.bind("ALT + SHIFT + TAB", "Cycle prev window",  hl.dsp.window.cycle_next({ next = false }))
o.bind("ALT + TAB",         "Reveal active window on top", hl.dsp.window.bring_to_top())
o.bind("ALT + SHIFT + TAB", "Reveal active window on top", hl.dsp.window.bring_to_top())

-- Resize active window (code:20 = "-", code:21 = "=")
o.bind("SUPER + code:20",         "Expand window left",  hl.dsp.window.resize({ x = -100, y = 0,   relative = true }))
o.bind("SUPER + code:21",         "Shrink window left",  hl.dsp.window.resize({ x = 100,  y = 0,   relative = true }))
o.bind("SUPER + SHIFT + code:20", "Shrink window up",    hl.dsp.window.resize({ x = 0,    y = -100, relative = true }))
o.bind("SUPER + SHIFT + code:21", "Expand window down",  hl.dsp.window.resize({ x = 0,    y = 100,  relative = true }))

-- Mouse scroll between workspaces
o.bind("SUPER + mouse_down", "Scroll workspace forward",  hl.dsp.focus({ workspace = "e+1" }))
o.bind("SUPER + mouse_up",   "Scroll workspace backward", hl.dsp.focus({ workspace = "e-1" }))

-- Mouse move/resize
o.bind("SUPER + mouse:272", "Move window",   hl.dsp.window.drag())
o.bind("SUPER + mouse:273", "Resize window", hl.dsp.window.resize())

-- Groups
o.bind("SUPER + G",         "Toggle window grouping",        hl.dsp.group.toggle())
o.bind("SUPER + SHIFT + G", "Move active window out of group", hl.dsp.window.move({ out_of_group = true }))

o.bind("SUPER + ALT + LEFT",  "Move window to group on left",   hl.dsp.window.move({ into_group = "l" }))
o.bind("SUPER + ALT + RIGHT", "Move window to group on right",  hl.dsp.window.move({ into_group = "r" }))
o.bind("SUPER + ALT + UP",    "Move window to group on top",    hl.dsp.window.move({ into_group = "u" }))
o.bind("SUPER + ALT + DOWN",  "Move window to group on bottom", hl.dsp.window.move({ into_group = "d" }))

o.bind("SUPER + ALT + TAB",         "Next window in group", hl.dsp.group.next())
o.bind("SUPER + ALT + SHIFT + TAB", "Prev window in group", hl.dsp.group.prev())

o.bind("SUPER + ALT + mouse_down", "Next window in group", hl.dsp.group.next())
o.bind("SUPER + ALT + mouse_up",   "Prev window in group", hl.dsp.group.prev())

for i = 1, 5 do
    o.bind("SUPER + ALT + " .. tostring(i),
        "Switch to group window " .. i,
        hl.dsp.group.active({ index = i }))
end

-- Special workspaces (scratchpad)
o.bind("SUPER + S",         "Toggle magic workspace", hl.dsp.workspace.toggle_special("magic"))
o.bind("SUPER + SHIFT + S", "Move to magic workspace", hl.dsp.window.move({ workspace = "special:magic" }))
-- o.bind("SUPER + SHIFT + O", "Move to note workspace",   hl.dsp.window.move({ workspace = "special:note" }))
-- o.bind("SUPER + SHIFT + U", "Move to zellij workspace", hl.dsp.window.move({ workspace = "special:zellij" }))
-- o.bind("SUPER + SHIFT + A", "Move to ai workspace",     hl.dsp.window.move({ workspace = "special:ai" }))
-- o.bind("SUPER + SHIFT + Y", "Move to yt workspace",     hl.dsp.window.move({ workspace = "special:yt" }))

-- Resize submap
o.bind("SUPER + R", "Enter resize submap", hl.dsp.submap("resize"))
hl.define_submap("resize", function()
    hl.bind("l", hl.dsp.window.resize({ x = 10,  y = 0,   relative = true }), { repeating = true })
    hl.bind("h", hl.dsp.window.resize({ x = -10, y = 0,   relative = true }), { repeating = true })
    hl.bind("k", hl.dsp.window.resize({ x = 0,   y = -10, relative = true }), { repeating = true })
    hl.bind("j", hl.dsp.window.resize({ x = 0,   y = 10,  relative = true }), { repeating = true })
    hl.bind("escape",   hl.dsp.submap("reset"))
    hl.bind("catchall", hl.dsp.submap("reset"))
end)

-- F11 fullscreen shortcuts
o.bind("SHIFT + F11", "Force full screen", hl.dsp.window.fullscreen({ mode = "fullscreen" }))
o.bind("ALT + F11",   "Full width",        hl.dsp.window.fullscreen({ mode = "maximized" }))
