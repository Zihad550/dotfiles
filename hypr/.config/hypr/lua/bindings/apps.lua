local home            = os.getenv("HOME")
local dotfiles_bin    = home .. "/dotfiles/bin"

local terminal        = "uwsm-app -- ghostty"
local role_launcher   = dotfiles_bin .. "/df-launch-role"

local work_browser    =
"uwsm-app -- helium-browser --profile-directory='Profile 2' --new-window --ozone-platform=wayland --ozone-platform-hint=wayland"
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
o.bind("SUPER + B", "System Browser", role_launcher .. " browser")
o.bind("SUPER + SHIFT + B", "Helium default",
    dev_browser)
o.bind("SUPER + F", "Preferred File Manager", role_launcher .. " file-manager")
o.bind("SUPER + E", "Zed", terminal .. [[ -e zsh -i -c "zed_open_dir"]])

-- Special / "or-focus" launches
-- o.bind("SUPER + ALT + B", "Zen Browser 008",
--     dotfiles_bin .. [[/df-launch-zen "zen008" "uwsm-app -- flatpak run app.zen_browser.zen -P 008"]])
-- initialClass must match hyprctl clients -j's .initialClass exactly (verify
-- with a live client, don't assume the bare binary name — see issue #81).
o.bind("SUPER + O", "Obsidian",
    dotfiles_bin .. [[/df-launch-special-workspace "md.obsidian.Obsidian" "note" obsidian -disable-gpu --enable-wayland-ime]])
o.bind("SUPER + SHIFT + W", "Helium (work)",
    dotfiles_bin .. [[/df-launch-special-workspace "helium" "work" --workspace-owned helium-browser --profile-directory='Profile 2']])
o.bind("SUPER + M", "Thunderbird",
    dotfiles_bin .. [[/df-launch-special-workspace "org.mozilla.Thunderbird" "thunderbird" thunderbird]])

-- TUI apps
o.bind("SUPER + SHIFT + T", "Bottom", dotfiles_bin .. "/df-launch-tui btm")
o.bind("SUPER + N", "Network", dotfiles_bin .. "/df-launch-tui nmtui")
o.bind("SUPER + SHIFT + D", "Docker", dotfiles_bin .. "/df-launch-tui lazydocker")
-- o.bind("SUPER + SHIFT + D", "Docker",
--     dotfiles_bin .. [[/df-launch-special-app "^lazydocker$" "ghostty -e lazydocker" "lazydocker"]])

-- Special TUI sessions
-- Fixed Herdr window; its dotted identity excludes ordinary Launcher-created
-- Ghostty windows. Follows Devcontainer Routing like every other call site --
-- see docs/adr/0007-super-u-follows-devcontainer-routing.md.
o.bind("SUPER + U", "Herdr",
    dotfiles_bin .. [[/df-launch-special-workspace "io.github.zihad550.dotfiles.herdr" "herdr" ghostty "--class=io.github.zihad550.dotfiles.herdr" "--title=herdr" -e "]] .. dotfiles_bin .. [[/df-herdr-session" herdr "]] .. home .. [[/dotfiles"]])

-- doesn't work, executable not found, not on PATH
-- o.bind("SUPER + SHIFT + R", "Timer",
--     dotfiles_bin .. [[/df-launch-special-app "gotimer" "ghostty -e go-timer" "gotimer"]])
-- o.bind("SUPER + SHIFT + R", "Timer", terminal .. " -e timer")

-- Web apps (PWA-like)
-- o.bind("SUPER + A", "ChatGPT",
--     dotfiles_bin .. [[/df-launch-special-webapp "chatgpt" "https://chatgpt.com" "ai"]])
o.bind("SUPER + A", "Claude",
    dotfiles_bin .. "/df-launch-claude")
-- o.bind("SUPER + M", "Gmail",
--     dotfiles_bin .. [[/df-launch-special-webapp "gmail" "https://mail.google.com/mail/u/0" "gmail"]])
o.bind("SUPER + SHIFT + C", "Calendar",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-calendar.google.com__calendar-Profile_2" "https://calendar.google.com/calendar" "calendar"]])
o.bind("SUPER + SHIFT + M", "Meet",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-meet.google.com__-Profile_2" "https://meet.google.com" "meet"]])
o.bind("SUPER + Z", "Zulip",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-mamacrm.zulipchat.com__-Profile_2" "https://mamacrm.zulipchat.com" "zulip"]])
o.bind("SUPER + Y", "YouTube",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-www.youtube.com__-Profile_2" "https://www.youtube.com" "yt"]])
o.bind("SUPER + T", "Tasks",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-tasks.google.com__u_1_tasks_-Profile_2" "https://tasks.google.com/u/1/tasks/" "tasks"]])
o.bind("SUPER + SHIFT + F", "Figma",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-www.figma.com__-Profile_2" "https://www.figma.com" "figma"]])
o.bind("SUPER + Q", "Quran",
    dotfiles_bin .. [[/df-launch-special-webapp "chrome-quran.com__-Profile_2" "https://quran.com" "holy-quran"]])
