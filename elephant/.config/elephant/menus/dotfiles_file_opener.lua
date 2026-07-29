Name = "dotfilesFileOpener"
NamePretty = "Open With"
Icon = "document-open"
Cache = false
HideFromProviderlist = true
Parent = "dotfilesFiles"
SearchName = false

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

-- The devpod devcontainer bind-mounts these at the same absolute path
-- (see setup/devcontainer/.devcontainer/devcontainer.json), so a remote location
-- is just the scheme + host + the local path. Paths outside them exist on the
-- host only and stay local. Keep in sync with dotfiles_files.lua.
local SSH_HOST = "devcontainer.devpod"
local MIRRORED = { "/dev", "/dotfiles", "/.agents" }

local function IsMirrored(path)
    local home = os.getenv("HOME") or ""
    if home == "" then return false end
    for _, sub in ipairs(MIRRORED) do
        local root = home .. sub
        if path == root or path:sub(1, #root + 1) == root .. "/" then
            return true
        end
    end
    return false
end

-- Editors open the copy inside the devcontainer over ssh; Files is always local.
-- Only Zed takes an ssh:// path directly — the VSCode forks want --remote, and
-- nvim needs a real ssh session in a terminal.
--
-- Placeholders: %PATH% the escaped file path, %URL% the escaped ssh:// URL,
-- %DIR% the escaped parent directory. %DIR% matters because the dirs-menu forms
-- of these commands assume their argument is a directory: nvim would try to cd
-- into a file, and `nautilus <file>` hands the file to the default handler —
-- i.e. exactly the xdg-open behaviour this menu exists to avoid.
local APPS = {
    {
        name = "Zed", icon = "zed",
        remote = "setsid uwsm-app -- zeditor %URL% >/dev/null 2>&1",
        localcmd = "setsid uwsm-app -- zeditor %PATH% >/dev/null 2>&1",
    },
    {
        name = "VSCode", icon = "vscode",
        remote = "setsid uwsm-app -- code --remote ssh-remote+" .. SSH_HOST .. " %PATH% >/dev/null 2>&1",
        localcmd = "setsid uwsm-app -- code %PATH% >/dev/null 2>&1",
    },
    {
        name = "Cursor", icon = "cursor",
        remote = "setsid uwsm-app -- cursor --remote ssh-remote+" .. SSH_HOST .. " %PATH% >/dev/null 2>&1",
        localcmd = "setsid uwsm-app -- cursor %PATH% >/dev/null 2>&1",
    },
    {
        name = "Neovim", icon = "nvim",
        remote = "setsid uwsm-app -- ghostty -e ssh -t " .. SSH_HOST .. " \"cd %DIR% && exec nvim %PATH%\" >/dev/null 2>&1",
        localcmd = "setsid uwsm-app -- ghostty --working-directory=%DIR% -e nvim %PATH% >/dev/null 2>&1",
    },
    {
        -- --select reveals the file in its folder instead of opening it.
        name = "Reveal in Files", icon = "folder",
        localcmd = "setsid uwsm-app -- nautilus --select %PATH% >/dev/null 2>&1",
    },
}

function GetEntries()
    local entries = {}
    local path = lastMenuValue("dotfilesFiles") or ""
    if path == "" then return entries end

    local dir = path:match("(.*)/") or "."
    local url = "ssh://" .. SSH_HOST .. path
    local escaped_path = ShellEscape(path)
    local escaped_dir = ShellEscape(dir)
    local escaped_url = ShellEscape(url)
    local mirrored = IsMirrored(path)

    for _, app in ipairs(APPS) do
        local remote = mirrored and app.remote ~= nil
        -- Function replacements so a "%" in the path is not read as a gsub capture.
        local cmd = (remote and app.remote or app.localcmd)
            :gsub("%%PATH%%", function() return escaped_path end)
            :gsub("%%DIR%%", function() return escaped_dir end)
            :gsub("%%URL%%", function() return escaped_url end)

        table.insert(entries, {
            Text = app.name,
            Subtext = remote and url or path,
            Value = path,
            Icon = app.icon,
            Actions = {
                ["menus:default"] = cmd,
            },
        })
    end

    return entries
end
