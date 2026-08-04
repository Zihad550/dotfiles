local home            = os.getenv("HOME")
local dotfiles_bin    = home .. "/dotfiles/bin"

local terminal        = "uwsm-app -- ghostty"
local menu            = "uwsm-app -- rofi -show drun"
local work_browser    =
"uwsm-app -- helium-browser --profile-directory='Profile 2' --new-window --ozone-platform=wayland --ozone-platform-hint=wayland"
local default_browser = "uwsm-app -- flatpak run app.zen_browser.zen -P dev"
local dev_browser     =
"uwsm-app -- helium-browser --profile-directory=Default --ozone-platform=wayland --ozone-platform-hint=wayland"
-- local webapp = browser .. " --app"

-- utility gui applications
-- o.bind("SUPER + ALT + 1", "MongoDB Compass",
--     "bash -c \"flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)\"")
-- o.bind("SUPER + ALT + 1", "Brave",      "uwsm-app -- brave --new-window --ozone-platform=wayland")
-- o.bind("SUPER + ALT + 2", "Perplexity", browser .. " --app=https://www.perplexity.ai")
-- o.bind("SUPER + ALT + 3", "Gemini",     browser .. " --app=https://gemini.google.com/app")

-- GUI apps
o.bind("SUPER + Return", "Terminal", terminal)
o.bind("SUPER + B", "Zen Browser dev", default_browser)
o.bind("SUPER + SHIFT + B", "Helium default",
    dev_browser)
o.bind("SUPER + F", "yazi", dotfiles_bin .. "/df-launch-tui yazi")
o.bind("SUPER + E", "Zed", terminal .. [[ -e zsh -i -c "zed_open_dir"]])

-- Special / "or-focus" launches
-- o.bind("SUPER + ALT + B", "Zen Browser 008",
--     dotfiles_bin .. [[/df-launch-zen "zen008" "uwsm-app -- flatpak run app.zen_browser.zen -P 008"]])
o.bind("SUPER + O", "Obsidian",
    dotfiles_bin .. [[/df-launch-special-app "obsidian" "obsidian -disable-gpu --enable-wayland-ime" "note"]])
o.bind("SUPER + SHIFT + W", "Helium (work)",
    dotfiles_bin .. [[/df-launch-special-app "helium" "helium-browser --profile-directory='Profile 2'" "work"]])
o.bind("SUPER + M", "Thunderbird",
    dotfiles_bin .. [[/df-launch-special-app "thunderbird" "thunderbird" "thunderbird"]])

-- TUI apps
o.bind("SUPER + SHIFT + T", "Bottom", dotfiles_bin .. "/df-launch-tui btm")
o.bind("SUPER + N", "Network", dotfiles_bin .. "/df-launch-tui nmtui")
o.bind("SUPER + SHIFT + D", "Docker", dotfiles_bin .. "/df-launch-tui lazydocker")
-- o.bind("SUPER + SHIFT + D", "Docker",
--     dotfiles_bin .. [[/df-launch-special-app "^lazydocker$" "ghostty -e lazydocker" "lazydocker"]])

-- Special TUI sessions
-- SUPER+U: the directories Launcher's Tmux session for ~/dotfiles, run by the
-- session script it names (bin/df-tmux-session, tickets 02-03): window one an
-- ssh shell into the devcontainer at the same path, window two local. Wrapped
-- in df-launch-special-app for the focus-don't-duplicate behavior: the window
-- match key is the title "tmux" -- the same key the previous binding used --
-- kept stable with --title, and the session script runs only when a new
-- window is actually launched; a running one is focused on special workspace
-- "tmux" instead.
o.bind("SUPER + U", "Tmux",
    dotfiles_bin .. [[/df-launch-special-app "tmux" "ghostty --title=tmux -e ]] .. dotfiles_bin .. [[/df-tmux-session tmux ']] .. home .. [[/dotfiles'" "tmux"]])
-- o.bind("SUPER + i", "Zellij",
--     dotfiles_bin .. [[/df-launch-special-app 'work-zellij' 'ghostty -e zellij -l work attach --create work-zellij options --on-force-close quit' 'work-zellij']])
-- o.bind("SUPER + i", "Tmux work session",
--     dotfiles_bin .. [[/df-launch-special-app 'work-tmux' 'tmux new -s work' 'work-tmux']])
-- o.bind("SUPER + i", "Tmux work session",
-- dotfiles_bin .. [[/df-launch-special-app 'tmux-work' 'ghostty -e tmux a -d -t tmux-work' 'tmux-work']])

-- doesn't work, executable not found, not on PATH
-- o.bind("SUPER + SHIFT + R", "Timer",
--     dotfiles_bin .. [[/df-launch-special-app "gotimer" "ghostty -e go-timer" "gotimer"]])
-- o.bind("SUPER + SHIFT + R", "Timer", terminal .. " -e timer")

-- Web apps (PWA-like)
-- o.bind("SUPER + A", "ChatGPT",
--     dotfiles_bin .. [[/df-launch-special-webapp "chatgpt" "https://chatgpt.com" "ai"]])
o.bind("SUPER + A", "Claude",
    dotfiles_bin .. [[/df-launch-special-webapp "claude" "https://claude.ai/chat" "ai"]])
-- o.bind("SUPER + M", "Gmail",
--     dotfiles_bin .. [[/df-launch-special-webapp "gmail" "https://mail.google.com/mail/u/0" "gmail"]])
o.bind("SUPER + SHIFT + C", "Calendar",
    dotfiles_bin .. [[/df-launch-special-webapp "Google Calendar" "https://calendar.google.com/calendar" "calendar"]])
o.bind("SUPER + SHIFT + M", "Meet",
    dotfiles_bin .. [[/df-launch-special-webapp "meet" "https://meet.google.com" "meet"]])
o.bind("SUPER + Z", "Zulip",
    dotfiles_bin .. [[/df-launch-special-webapp "zulip" "https://mamacrm.zulipchat.com" "zulip"]])
o.bind("SUPER + Y", "YouTube",
    dotfiles_bin .. [[/df-launch-special-webapp "youtube" "https://www.youtube.com" "yt"]])
o.bind("SUPER + T", "Tasks",
    dotfiles_bin .. [[/df-launch-special-webapp "tasks" "https://tasks.google.com/u/1/tasks/" "tasks"]])
o.bind("SUPER + SHIFT + F", "Figma",
    dotfiles_bin .. [[/df-launch-special-webapp "figma" "https://www.figma.com" "figma"]])
o.bind("SUPER + Q", "Quran",
    dotfiles_bin .. [[/df-launch-special-webapp "quran" "https://quran.com" "holy-quran"]])
