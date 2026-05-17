local home = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

local terminal = "uwsm-app -- ghostty"
local menu     = "uwsm-app -- rofi -show drun"
local browser  = "uwsm-app -- helium-browser --profile-directory='Profile 2' --new-window --ozone-platform=wayland --ozone-platform-hint=wayland"
-- local webapp = browser .. " --app"

-- utility gui applications
-- o.bind("SUPER + ALT + 1", "MongoDB Compass",
--     "bash -c \"flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)\"")
-- o.bind("SUPER + ALT + 1", "Brave",      "uwsm-app -- brave --new-window --ozone-platform=wayland")
-- o.bind("SUPER + ALT + 2", "Perplexity", browser .. " --app=https://www.perplexity.ai")
-- o.bind("SUPER + ALT + 3", "Gemini",     browser .. " --app=https://gemini.google.com/app")

-- GUI apps
o.bind("SUPER + Return",    "Terminal",            terminal)
o.bind("SUPER + B",         "Zen Browser dev",     "uwsm-app -- flatpak run app.zen_browser.zen -P dev")
o.bind("SUPER + SHIFT + B", "Helium default",      "uwsm-app -- helium-browser --profile-directory=Default --ozone-platform=wayland --ozone-platform-hint=wayland")
o.bind("SUPER + F",         "yazi",                terminal .. " -e yazi")
o.bind("SUPER + E",         "Zed",                 terminal .. [[ -e zsh -i -c "zed_open_dir"]])

-- Special / "or-focus" launches
-- o.bind("SUPER + ALT + B", "Zen Browser 008",
--     dotfiles_bin .. [[/hyprland-launch-zen "zen008" "uwsm-app -- flatpak run app.zen_browser.zen -P 008"]])
o.bind("SUPER + O",         "Obsidian",
    dotfiles_bin .. [[/hyprland-launch-special-app "obsidian" "obsidian -disable-gpu --enable-wayland-ime" "note"]])
o.bind("SUPER + SHIFT + W", "Helium (work)",
    dotfiles_bin .. [[/hyprland-launch-special-app "helium" "helium-browser --profile-directory='Profile 2'" "work"]])
o.bind("SUPER + M",         "Thunderbird",
    dotfiles_bin .. [[/hyprland-launch-special-app "thunderbird" "thunderbird" "thunderbird"]])

-- TUI apps
o.bind("SUPER + SHIFT + T", "Bottom",   terminal .. " -e btm")
o.bind("SUPER + N",         "Network",  terminal .. " -e nmtui")
o.bind("SUPER + SHIFT + D", "Docker",   terminal .. " -e lazydocker")
-- o.bind("SUPER + SHIFT + D", "Docker",
--     dotfiles_bin .. [[/hyprland-launch-special-app "^lazydocker$" "ghostty -e lazydocker" "lazydocker"]])

-- Special TUI sessions
o.bind("SUPER + U", "Tmux",
    dotfiles_bin .. [[/hyprland-launch-special-app "tmux" "ghostty -e tmux new -As tmux" "tmux"]])
-- o.bind("SUPER + i", "Zellij",
--     dotfiles_bin .. [[/hyprland-launch-special-app 'work-zellij' 'ghostty -e zellij -l work attach --create work-zellij options --on-force-close quit' 'work-zellij']])
-- o.bind("SUPER + i", "Tmux work session",
--     dotfiles_bin .. [[/hyprland-launch-special-app 'work-tmux' 'tmux new -s work' 'work-tmux']])
o.bind("SUPER + i", "Tmux work session",
    dotfiles_bin .. [[/hyprland-launch-special-app 'tmux-work' 'ghostty -e tmux a -d -t tmux-work' 'tmux-work']])

-- doesn't work, executable not found, not on PATH
-- o.bind("SUPER + SHIFT + R", "Timer",
--     dotfiles_bin .. [[/hyprland-launch-special-app "gotimer" "ghostty -e go-timer" "gotimer"]])
-- o.bind("SUPER + SHIFT + R", "Timer", terminal .. " -e timer")

-- Web apps (PWA-like)
-- o.bind("SUPER + A", "ChatGPT",
--     dotfiles_bin .. [[/hyprland-launch-special-webapp "chatgpt" "https://chatgpt.com" "ai"]])
o.bind("SUPER + A",         "Claude",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "claude" "https://claude.ai/chat" "ai"]])
-- o.bind("SUPER + M", "Gmail",
--     dotfiles_bin .. [[/hyprland-launch-special-webapp "gmail" "https://mail.google.com/mail/u/0" "gmail"]])
o.bind("SUPER + SHIFT + C", "Calendar",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "Google Calendar" "https://calendar.google.com/calendar" "calendar"]])
o.bind("SUPER + SHIFT + M", "Meet",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "meet" "https://meet.google.com" "meet"]])
o.bind("SUPER + Z",         "Zulip",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "zulip" "https://mamacrm.zulipchat.com" "zulip"]])
o.bind("SUPER + Y",         "YouTube",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "youtube" "https://www.youtube.com" "yt"]])
o.bind("SUPER + T",         "Tasks",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "tasks" "https://tasks.google.com/u/1/tasks/" "tasks"]])
o.bind("SUPER + SHIFT + F", "Figma",
    dotfiles_bin .. [[/hyprland-launch-special-webapp "figma" "https://www.figma.com" "figma"]])
