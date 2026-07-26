Name = "dotfilesFiles"
NamePretty = "Files"
Icon = "text-x-generic"
Cache = false
HideFromProviderlist = false
SearchName = false
SubMenu = "dotfilesFileOpener"

-- Folder-scoped file listing. Type a folder name; you get the folders matching
-- it, each followed by its immediate contents.
--
-- The earlier design cached every file under the dev roots and rebuilt the whole
-- entry list per keystroke. At 340k files that measured 1.2s per keystroke, so
-- it is gone: nothing is listed until a folder name is typed, and then only one
-- directory level is read. Cost no longer scales with how many files exist.
--
-- Score against Keywords only, same reasoning as dotfiles_dirs.lua: elephant's
-- score is max(fuzzy - min(index*5, 50) - match_start_offset, 10), so putting the
-- leaf name at index 0 keeps ranking from being dominated by path depth.
SearchPriority = { "keywords" }

-- Keep in sync with dotfiles_dirs.lua / dotfiles_file_opener.lua.
local SSH_HOST = "devcontainer.devpod"
local MIRRORED = { "/dev-0", "/dotfiles", "/.agents" }

-- Menu-level default: mirrored paths resolve inside the devcontainer over ssh.
-- GetEntries overrides this per entry for host-only paths.
Actions = {
    ["menus:default"] = "setsid uwsm-app -- zeditor ssh://" .. SSH_HOST .. "%VALUE% >/dev/null 2>&1",
}

-- Matching folders listed, and how many of them get their contents expanded.
-- Expanding costs one directory read each, so this is the only real knob.
local MAX_DIRS = 40
local MAX_EXPAND = 10

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function IsMirrored(path, home)
    for _, sub in ipairs(MIRRORED) do
        local root = home .. sub
        if path == root or path:sub(1, #root + 1) == root .. "/" then
            return true
        end
    end
    return false
end

function GetEntries(query)
    local entries = {}
    local q = (query or ""):lower()
    -- No folder name, no results -- deliberately, per the design above.
    if q == "" then return entries end

    local home = os.getenv("HOME") or ""
    if home == "" then return entries end
    local home_prefix_len = #home + 2

    -- Reuse the directory picker's cache rather than maintaining a second index.
    -- dotfiles_dirs.lua and bin/df-dir-picker both keep it fresh.
    local cache_file = home .. "/.cache/df-dir-picker/folders.list"
    local handle = io.popen("cat " .. ShellEscape(cache_file) .. " 2>/dev/null")
    if not handle then return entries end

    -- Plain substring, not fuzzy -- consistent with the dirs menu.
    --
    -- Matched on the folder NAME, not the whole path: a query of "backend" must
    -- not also select dev-0/api/backend/src just because an ancestor matched.
    -- Those are already listed as that folder's contents, and matching them here
    -- produced the same directory twice. A query containing "/" is by definition
    -- about the path, so it falls back to matching rel.
    local spanning = q:find("/", 1, true) ~= nil
    local matches = {}
    for path in handle:lines() do
        if path ~= "" then
            local rel = (path == home) and "~" or path:sub(home_prefix_len)
            local lrel = rel:lower()
            -- Cheap plain find first. If q is absent from the whole path it
            -- cannot be in the leaf either, so the leaf pattern -- which costs
            -- ~120ms when run over all 15k paths -- only runs on candidates.
            if lrel:find(q, 1, true) then
                local leaf = lrel:match("[^/]*$")
                if spanning or leaf:find(q, 1, true) then
                    local rank
                    if leaf == q then
                        rank = 0
                    elseif leaf:sub(1, #q) == q then
                        rank = 1
                    elseif leaf:find(q, 1, true) then
                        rank = 2
                    else
                        rank = 3
                    end
                    matches[#matches + 1] = { path = path, rel = rel, rank = rank }
                end
            end
        end
    end
    handle:close()

    -- Best folder first: exact name, then prefix, then substring, then a match
    -- somewhere further up the path. Shallower wins ties.
    table.sort(matches, function(a, b)
        if a.rank ~= b.rank then return a.rank < b.rank end
        if #a.rel ~= #b.rel then return #a.rel < #b.rel end
        return a.rel < b.rel
    end)

    -- One find over every expanded folder, so this stays a single fork no matter
    -- how many matched. "%y %p" prefixes each path with its type (d/f/l).
    local children = {}
    local expand = math.min(#matches, MAX_EXPAND)
    if expand > 0 then
        local args = ""
        for i = 1, expand do
            args = args .. " " .. ShellEscape(matches[i].path)
        end
        local ch = io.popen("find" .. args
            .. " -mindepth 1 -maxdepth 1 -printf '%y %p\\n' 2>/dev/null")
        if ch then
            for line in ch:lines() do
                local kind, p = line:match("^(%a) (.*)$")
                if kind and p then
                    local parent = p:match("(.*)/")
                    if parent then
                        children[parent] = children[parent] or {}
                        table.insert(children[parent], { kind = kind, path = p })
                    end
                end
            end
            ch:close()
        end
    end

    -- A nested folder can still be both a match and a parent's child (searching
    -- "backend" with dev-0/backend/backend-utils). First occurrence wins, which
    -- is the ranked match rather than the child copy.
    local seen = {}

    local function add(path, rel, isdir)
        if seen[path] then return end
        seen[path] = true

        local entry = {
            Text = isdir and (rel .. "/") or rel,
            Subtext = path,
            -- rel is what carries the query for a child file: "index.ts" does not
            -- contain "backend", but "dev-0/api/backend/index.ts" does, and
            -- calcScore keeps the best-scoring field.
            Keywords = { rel:match("[^/]*$"), rel },
            Value = path,
            Icon = isdir and "folder" or "text-x-generic",
        }
        if not IsMirrored(path, home) then
            entry.Actions = {
                ["menus:default"] = "setsid uwsm-app -- zeditor "
                    .. ShellEscape(path) .. " >/dev/null 2>&1",
            }
        end
        entries[#entries + 1] = entry
    end

    for i = 1, math.min(#matches, MAX_DIRS) do
        local m = matches[i]
        add(m.path, m.rel, true)

        local kids = children[m.path]
        if kids then
            table.sort(kids, function(a, b) return a.path < b.path end)
            for _, c in ipairs(kids) do
                add(c.path, c.path:sub(home_prefix_len), c.kind == "d")
            end
        end
    end

    return entries
end
