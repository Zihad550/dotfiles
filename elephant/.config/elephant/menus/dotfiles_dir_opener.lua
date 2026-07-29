Name = "dotfilesDirOpener"
NamePretty = "Open With"
Icon = "folder-open"
Cache = false
HideFromProviderlist = true
Parent = "dotfilesDirs"
SearchName = false

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

-- The devpod devcontainer bind-mounts these at the same absolute path
-- (see setup/devcontainer/.devcontainer/devcontainer.json), so a remote location
-- is just the scheme + host + the local path. Paths outside them exist on the
-- host only and stay local. Keep in sync with dotfiles_dirs.lua.
local SSH_HOST = "devcontainer.devpod"
local MIRRORED = { "/dev", "/dotfiles", "/.agents" }

local function IsMirrored(dir)
    local home = os.getenv("HOME") or ""
    if home == "" then return false end
    for _, sub in ipairs(MIRRORED) do
        local root = home .. sub
        if dir == root or dir:sub(1, #root + 1) == root .. "/" then
            return true
        end
    end
    return false
end

-- Editors open the copy inside the devcontainer over ssh; Files is always local.
-- Only Zed takes an ssh:// path directly — the VSCode forks want --remote, and
-- nvim needs a real ssh session in a terminal.
-- %URL% is the escaped ssh:// URL, %PATH% the escaped absolute path (identical on
-- both sides, hence the shared placeholder).
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
        remote = "setsid uwsm-app -- ghostty -e ssh -t " .. SSH_HOST .. " \"cd %PATH% && exec nvim\" >/dev/null 2>&1",
        localcmd = "setsid uwsm-app -- ghostty --working-directory=%PATH% -e nvim >/dev/null 2>&1",
    },
    {
        name = "Files", icon = "folder",
        localcmd = "setsid uwsm-app -- nautilus %PATH% >/dev/null 2>&1",
    },
}

function GetEntries()
    local entries = {}
    local dir = lastMenuValue("dotfilesDirs") or ""
    if dir == "" then return entries end

    local url = "ssh://" .. SSH_HOST .. dir
    local escaped_path = ShellEscape(dir)
    local escaped_url = ShellEscape(url)
    local mirrored = IsMirrored(dir)

    for _, app in ipairs(APPS) do
        local remote = mirrored and app.remote ~= nil
        -- Function replacements so a "%" in the path is not read as a gsub capture.
        local cmd = (remote and app.remote or app.localcmd)
            :gsub("%%PATH%%", function() return escaped_path end)
            :gsub("%%URL%%", function() return escaped_url end)

        table.insert(entries, {
            Text = app.name,
            Subtext = remote and url or dir,
            Value = dir,
            Icon = app.icon,
            Actions = {
                ["menus:default"] = cmd,
            },
        })
    end

    return entries
end
