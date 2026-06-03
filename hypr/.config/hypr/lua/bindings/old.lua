-- Port of conf/old-keybindings.conf — entirely commented cruft kept for reference.

-- custom scripts
-- o.bind("SUPER + ALT + S", nil,
--     [[bash -c 'if pgrep -f nerd-dictation >/dev/null; then nerd-dictation end; else nerd-dictation begin --simulate-input-tool WTYPE --idle-time 0 >/dev/null 2>&1 & fi']])
-- o.bind("SUPER + SHIFT + space", nil, [[rofi -modi "window,ssh" -show combi]])
-- rofi -show drun -run-command "uwsm app -- {cmd}"
-- rofi -modi "drun,ssh,window,combi" -show combi -run-command "uwsm app -- {cmd}"

-- o.bind("SUPER + B", "Zen Browser Dev",
--     os.getenv("HOME") .. [[/dotfiles/bin/df-launch-zen "zendev" "uwsm-app -- flatpak run app.zen_browser.zen -P dev"]])
-- o.bind("SUPER + SHIFT + B", "Zen Browser 008", "uwsm-app -- flatpak run app.zen_browser.zen -P 008")
-- o.bind("SUPER + SHIFT + F", nil, [[ghostty -e zsh -i -c "fod"]])
-- gui application
-- o.bind("SUPER + B", nil, "flatpak run app.zen_browser.zen -P")

-- Trigger when the switch is toggled (lid open/close)
-- o.bind("switch:Lid Switch", nil, "hyprlock", { locked = true })

-- Trigger when the switch is turning off.
-- o.bind("switch:off:Lid Switch", nil, [[hyprctl keyword monitor "eDP-1, disable"]], { locked = true })

-- not working
-- Trigger when the switch is turning on.
-- o.bind("switch:on:Lid Switch", nil, [[hyprctl keyword monitor "eDP-1, preferred, 1080x860, 1"]], { locked = true })

-- o.bind("SUPER + P", "Processes", "uwsm-app -- rofi -show manage_processes")
-- o.bind("SUPER + P", "Scripts",   "uwsm-app -- rofi -show multi_script")
-- o.bind("SUPER + SHIFT + space", "Window", "uwsm-app -- rofi -show window")
