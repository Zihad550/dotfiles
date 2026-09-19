hl.config({
    input = {
        kb_layout = "us",
        kb_variant = "",
        kb_model = "",
        kb_options = "",
        kb_rules = "",
        follow_mouse = 1,
        -- mouse sensitivity / mouse acceleration
        sensitivity = 1, -- -1.0 - 1.0, 0 means no modification
        -- mouse scroll
        scroll_factor = 1.5,
        touchpad = {
            natural_scroll = false,
            scroll_factor = 1.4,
        },
    },
})

hl.gesture({
    fingers = 3,
    direction = "horizontal",
    action = "workspace",
})

if os.getenv("DOTFILES_PROFILE") == "arch-workstation" then
    local video_seek = os.getenv("HOME") .. "/dotfiles/bin/df-video-seek"

    -- Four fingers avoid the three-finger workspace gesture above.
    hl.gesture({
        fingers = 4,
        direction = "left",
        action = function() hl.exec_cmd(video_seek .. " back-5") end,
    })
    hl.gesture({
        fingers = 4,
        direction = "right",
        action = function() hl.exec_cmd(video_seek .. " forward-5") end,
    })
end

-- hl.gesture({
--     fingers = 3,
--     direction = "vertical",
--     action = "workspace",
-- })

-- hl.device({
--     name = "epic-mouse-v1",
--     sensitivity = -0.5,
-- })
