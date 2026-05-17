Name = "dotfilesDirs"
NamePretty = "Directories"
Icon = "folder"
Cache = false
HideFromProviderlist = false
SearchName = true
SubMenu = "dotfilesDirOpener"

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local PRUNE = {
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission",
}

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME") or ""
    if home == "" then return entries end

    local prune_expr = ""
    for i, name in ipairs(PRUNE) do
        if i > 1 then prune_expr = prune_expr .. " -o " end
        prune_expr = prune_expr .. "-name " .. ShellEscape(name)
    end

    local cmd = "find " .. ShellEscape(home)
        .. " -maxdepth 6 -type d \\( " .. prune_expr .. " \\) -prune"
        .. " -o -type d -print 2>/dev/null"

    local handle = io.popen(cmd)
    if not handle then return entries end

    for path in handle:lines() do
        local rel
        if path == home then
            rel = "~"
        else
            rel = path:sub(#home + 2)
        end

        local label = rel
        local subtext = path
        local name = path:match("([^/]+)$") or path

        table.insert(entries, {
            Text = label,
            Subtext = subtext,
            Value = path,
            Keywords = { name },
            Actions = {
                ["menus:default"] = "setsid uwsm-app -- zeditor " .. ShellEscape(path) .. " >/dev/null 2>&1",
            },
        })
    end
    handle:close()

    return entries
end
