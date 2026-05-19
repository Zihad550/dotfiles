Name = "dotfilesDirs"
NamePretty = "Directories"
Icon = "folder"
Cache = false
HideFromProviderlist = false
SearchName = true
SubMenu = "dotfilesDirOpener"

-- Menu-level action: %VALUE% is replaced with entry.Value (the path) at activate time.
Actions = {
    ["menus:default"] = "setsid uwsm-app -- zeditor %VALUE% >/dev/null 2>&1",
}

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local PRUNE = {
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission",
}

local ROOTS = { ".dotfiles", "dev-0", "dev" }

local function BuildCacheCmd(home, cache_file, tmp_file)
    local prune = ""
    for i, name in ipairs(PRUNE) do
        if i > 1 then prune = prune .. " -o " end
        prune = prune .. "-name " .. ShellEscape(name)
    end

    local existing = {}
    for _, name in ipairs(ROOTS) do
        local path = home .. "/" .. name
        local f = io.open(path, "r")
        if f then f:close(); existing[#existing + 1] = path end
    end
    if #existing == 0 then return "true" end

    local roots = ""
    for _, p in ipairs(existing) do
        roots = roots .. " " .. ShellEscape(p)
    end

    return "mkdir -p " .. ShellEscape(cache_file:match("(.*)/")) .. " && "
        .. "find" .. roots
        .. " -maxdepth 6 -type d \\( " .. prune .. " \\) -prune"
        .. " -o -type d -print 2>/dev/null > " .. ShellEscape(tmp_file)
        .. " && mv " .. ShellEscape(tmp_file) .. " " .. ShellEscape(cache_file)
end

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME") or ""
    if home == "" then return entries end
    local home_prefix_len = #home + 2

    local cache_dir = home .. "/.cache/dotfiles-dir-picker"
    local cache_file = cache_dir .. "/folders.list"
    local tmp_file = cache_file .. ".tmp"

    local check = io.popen("test -s " .. ShellEscape(cache_file) .. " && echo ok 2>/dev/null")
    local exists = false
    if check then
        exists = check:read("*l") == "ok"
        check:close()
    end

    if not exists then
        os.execute(BuildCacheCmd(home, cache_file, tmp_file))
    else
        -- Background refresh if cache is older than 5 minutes and no rebuild in progress.
        -- The tmp_file acts as a lock: find writes to it then renames atomically, so a
        -- present tmp_file means another rebuild is already running.
        local refresh = "if [ ! -e " .. ShellEscape(tmp_file) .. " ] && "
            .. "[ $(($(date +%s) - $(stat -c %Y " .. ShellEscape(cache_file) .. "))) -gt 300 ]; then "
            .. BuildCacheCmd(home, cache_file, tmp_file)
            .. "; fi"
        os.execute("(" .. refresh .. ") >/dev/null 2>&1 &")
    end

    local handle = io.popen("cat " .. ShellEscape(cache_file) .. " 2>/dev/null")
    if not handle then return entries end

    for path in handle:lines() do
        if path ~= "" then
            local rel
            if path == home then
                rel = "~"
            else
                rel = path:sub(home_prefix_len)
            end

            entries[#entries + 1] = {
                Text = rel,
                Subtext = path,
                Value = path,
            }
        end
    end
    handle:close()

    return entries
end
