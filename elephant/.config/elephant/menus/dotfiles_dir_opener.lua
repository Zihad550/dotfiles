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

local APPS = {
    { name = "Zed",     icon = "zed",                cmd = "setsid uwsm-app -- zeditor %s >/dev/null 2>&1" },
    { name = "VSCode",  icon = "vscode",             cmd = "setsid uwsm-app -- code %s >/dev/null 2>&1" },
    { name = "Cursor",  icon = "cursor",             cmd = "setsid uwsm-app -- cursor %s >/dev/null 2>&1" },
    { name = "Neovim",  icon = "nvim",               cmd = "setsid uwsm-app -- ghostty --working-directory=%s -e nvim >/dev/null 2>&1" },
    { name = "Files",   icon = "folder",             cmd = "setsid uwsm-app -- nautilus %s >/dev/null 2>&1" },
}

function GetEntries()
    local entries = {}
    local dir = lastMenuValue("dotfilesDirs") or ""
    if dir == "" then return entries end

    local escaped = ShellEscape(dir)
    for _, app in ipairs(APPS) do
        table.insert(entries, {
            Text = app.name,
            Subtext = dir,
            Value = dir,
            Icon = app.icon,
            Actions = {
                ["menus:default"] = app.cmd:gsub("%%s", escaped),
            },
        })
    end

    return entries
end
