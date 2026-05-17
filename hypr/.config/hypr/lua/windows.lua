-- Suppress maximize requests from all apps.
hl.window_rule({
    name  = "suppress-maximize-events",
    match = { class = ".*" },
    suppress_event = "maximize",
})

-- Just a dash of opacity by default
-- hl.window_rule({ match = { class = ".*" }, opacity = "0.97 0.9" })

-- Application-specific animation (from conf/walker.conf)
-- hl.layer_rule({ match = { namespace = "walker" }, no_anim = true })

-- XWayland drag artifact fix.
hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

-- Per-workspace scrolling layout.
for _, ws in ipairs({ "1", "3", "4", "5", "6", "7", "8", "9" }) do
    hl.workspace_rule({ workspace = ws, layout = "scrolling" })
end
