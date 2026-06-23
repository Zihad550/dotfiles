hl.config({
    general = {
        gaps_in = 0,
        gaps_out = 0,
        border_size = 2,
        col = {
            active_border   = "rgba(c6a0f6ff)",
            inactive_border = "rgba(595959aa)",
        },
        resize_on_border = false,
        allow_tearing = false,
    },

    decoration = {
        rounding = 4,
        -- rounding_power = 2,
        active_opacity = 1.0,
        inactive_opacity = 1.0,
        dim_inactive = true,
        dim_strength = 0.1,
        -- shadow = {
        --     enabled = true,
        --     range = 4,
        --     render_power = 3,
        --     color = "rgba(1a1a1aee)",
        -- },
        blur = {
            -- disabled for performance optimization
            enabled = false,
            -- size = 3,
            -- passes = 1,
            -- vibrancy = 0.1696,
        },
        shadow = {
            -- disabled for performance optimization
            enabled = false,
        },
    },

    dwindle = {
        preserve_split = true,
    },

    scrolling = {
        fullscreen_on_one_column = true,
        column_width = 1.0,
        direction = "down",
    },

    master = {
        new_status = "master",
    },

    misc = {
        force_default_wallpaper = -1,
        disable_hyprland_logo = true,
        disable_splash_rendering = true,
        disable_scale_notification = true,
        focus_on_activate = true,
        anr_missed_pings = 3,
        on_focus_under_fullscreen = 1,
    },

    cursor = {
        hide_on_key_press = true,
        warp_on_change_workspace = 1,
    },

    debug = {
        vfr = true,
    },

    binds = {
        hide_special_on_workspace_change = true,
    },

    animations = {
        enabled = true,
    },
})

-- "Smart gaps" / "No gaps when only" — uncomment if desired
-- hl.workspace_rule({ workspace = "w[tv1]", gaps_out = 0, gaps_in = 0 })
-- hl.workspace_rule({ workspace = "f[1]",   gaps_out = 0, gaps_in = 0 })
-- hl.window_rule({ match = { float = false, workspace = "w[tv1]" }, border_size = 0, rounding = 0 })
-- hl.window_rule({ match = { float = false, workspace = "f[1]"  }, border_size = 0, rounding = 0 })

hl.curve("easeOutQuint", { type = "bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })
hl.curve("easeInOutCubic", { type = "bezier", points = { { 0.65, 0.05 }, { 0.36, 1 } } })
hl.curve("linear", { type = "bezier", points = { { 0, 0 }, { 1, 1 } } })
hl.curve("almostLinear", { type = "bezier", points = { { 0.5, 0.5 }, { 0.75, 1.0 } } })
hl.curve("quick", { type = "bezier", points = { { 0.15, 0 }, { 0.1, 1 } } })

hl.animation({ leaf = "global", enabled = true, speed = 4, bezier = "default" })
hl.animation({ leaf = "border", enabled = true, speed = 2.695, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows", enabled = true, speed = 1.9, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 1.6, bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 0.6, bezier = "linear", style = "popin 87%" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 0.7, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 0.6, bezier = "almostLinear" })
hl.animation({ leaf = "fade", enabled = true, speed = 1.515, bezier = "quick" })
hl.animation({ leaf = "layers", enabled = true, speed = 1.5, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 1.6, bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 0.6, bezier = "linear", style = "fade" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 0.7, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 0.55, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 0.75, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 0.12, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 0.12, bezier = "almostLinear", style = "fade" })
