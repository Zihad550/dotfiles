Name = "dotfilesDirs"
NamePretty = "Directories"
Icon = "folder"
Cache = false
HideFromProviderlist = false
SearchName = true
SubMenu = "dotfilesDirOpener"

-- Score against Keywords only (getHaystack honours this list and ignores the
-- rest). Keywords are { leaf, relative path }, so the bare directory name is the
-- index-0 field: elephant's score is
--     max(fuzzy - min(index*5, 50) - match_start_offset, 10)
-- and matching the leaf means offset 0 with no field penalty. Scoring Text or
-- Subtext instead made the offset -- i.e. how deep the path is -- the dominant
-- term, so "dev-0/backend.old" beat a directory actually named "backend" simply
-- for sitting closer to the root. This also decouples ranking from Elide, which
-- would otherwise shift scores by shortening the label.
SearchPriority = { "keywords" }

-- The devpod devcontainer bind-mounts these at the same absolute path
-- (see setup/devcontainer/.devcontainer/devcontainer.json), so a remote location
-- is just the scheme + host + the local path. Keep in sync with
-- dotfiles_dir_opener.lua, which does the same for the "Open With" submenu.
local SSH_HOST = "devcontainer.devpod"
local MIRRORED = { "/dev-0", "/dotfiles", "/.agents" }

-- Menu-level action: %VALUE% is replaced with entry.Value (the path) at activate
-- time. Mirrored paths are the common case, so ssh is the default; GetEntries
-- overrides it per entry for host-only paths, which have no remote counterpart.
Actions = {
    ["menus:default"] = "setsid uwsm-app -- zeditor ssh://" .. SSH_HOST .. "%VALUE% >/dev/null 2>&1",
}

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function IsMirrored(dir, home)
    for _, sub in ipairs(MIRRORED) do
        local root = home .. sub
        if dir == root or dir:sub(1, #root + 1) == root .. "/" then
            return true
        end
    end
    return false
end

local PRUNE = {
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission",
}

-- "dotfiles", not ".dotfiles": the repo lives at ~/dotfiles, which is also what
-- MIRRORED above says. Roots that do not exist are dropped below.
local ROOTS = { "dotfiles", "dev-0", "dev" }

-- Roughly how many columns of Text fit before GTK truncates. Deliberately a soft
-- knob, not a measurement: GetEntries cannot see the window width, and walker is
-- launched at two different widths (644 via df-launch-walker, 800 via
-- df-dir-picker). Because eliding snaps to "/" boundaries, being wrong only
-- means eliding a little early (still readable) or a little late (GTK truncates
-- the tail, as it does today). Tune by feel.
local BUDGET = 60

-- "/…/" renders as 3 columns even though the ellipsis is 3 bytes.
local ELLIPSIS = "/…/"

-- Long paths get their middle dropped instead of their tail, so the leaf -- and
-- whatever the query matched -- stays visible: "dev-0/…/matching-dir".
-- Cuts land on "/" boundaries only, which keeps it readable and makes it
-- impossible to slice a UTF-8 filename mid-byte.
local function Elide(text, q)
    local head_end = text:find("/", 1, true)
    if not head_end then return text end

    local head = text:sub(1, head_end - 1)
    local room = BUDGET - #head - 3
    if room < 1 then return text end

    -- Longest suffix that fits, snapped forward to the next segment edge.
    local want = #text - room + 1
    local edge = text:find("/", want, true)
    local start = edge and edge + 1 or want

    -- If the match sits further left than that, pull back to the start of the
    -- segment holding it so the user still sees why the entry is listed.
    -- mp > head_end: a match inside the head segment needs no pull-back, the head
    -- is shown regardless. Without that check "/dotfiles" would drag start to 1
    -- and trip the guard below, returning the path unelided.
    if q ~= "" then
        local mp = text:lower():find(q, 1, true)
        if mp and mp > head_end and mp < start then
            while mp > 1 and text:sub(mp - 1, mp - 1) ~= "/" do
                mp = mp - 1
            end
            start = mp
        end
    end

    -- Nothing meaningful left to drop.
    if start <= head_end + 1 then return text end

    local out = head .. ELLIPSIS .. text:sub(start)
    -- Each ELLIPSIS is 3 bytes wide but 1 column, hence the -2 per occurrence.
    if #out - 2 <= BUDGET then return out end

    -- Still over budget, which means pulling back to a far-left match dragged in
    -- everything after it. Drop that stretch too, so the head, the matching
    -- segment and the leaf all survive: "dev-0/…/monorepo/…/matching-dir".
    local seg_end = text:find("/", start, true)
    local matched = seg_end and text:sub(start, seg_end - 1) or text:sub(start)
    local leaf = text:match("[^/]*$")
    if matched ~= leaf then
        return head .. ELLIPSIS .. matched .. ELLIPSIS .. leaf
    end

    return out
end

local function BuildCacheCmd(home, cache_file, tmp_file)
    local prune = ""
    for i, name in ipairs(PRUNE) do
        if i > 1 then prune = prune .. " -o " end
        prune = prune .. "-name " .. ShellEscape(name)
    end

    local escaped_home = ShellEscape(home)

    -- Two scans, deduped: $HOME one level deep so plain folders (Downloads,
    -- Pictures, ...) are reachable, and the dev roots deep. Hidden entries are
    -- skipped at the home level to keep the list readable -- drop the
    -- "-o -name '.*'" below to include them.
    local scans = "printf '%s\\n' " .. escaped_home .. "; "
        .. "find " .. escaped_home .. " -mindepth 1 -maxdepth 1"
        .. " \\( " .. prune .. " -o -name '.*' \\) -prune"
        .. " -o -type d -print; "

    local existing = {}
    for _, name in ipairs(ROOTS) do
        local path = home .. "/" .. name
        local f = io.open(path, "r")
        if f then f:close(); existing[#existing + 1] = path end
    end

    if #existing > 0 then
        local roots = ""
        for _, p in ipairs(existing) do
            roots = roots .. " " .. ShellEscape(p)
        end
        scans = scans .. "find" .. roots
            .. " -maxdepth 6 -type d \\( " .. prune .. " \\) -prune"
            .. " -o -type d -print; "
    end

    return "mkdir -p " .. ShellEscape(cache_file:match("(.*)/")) .. " && "
        .. "{ " .. scans .. "} 2>/dev/null | sort -u > " .. ShellEscape(tmp_file)
        .. " && mv " .. ShellEscape(tmp_file) .. " " .. ShellEscape(cache_file)
end

-- Cache = false means elephant re-runs this per keystroke and hands us the
-- current query, which is what lets Elide keep the matching segment. Setting
-- Cache = true would run the script once with no query and disable that.
-- query is nil-guarded so the menu still works if it is not passed.
function GetEntries(query)
    local entries = {}
    local q = (query or ""):lower()
    local home = os.getenv("HOME") or ""
    if home == "" then return entries end
    local home_prefix_len = #home + 2

    local cache_dir = home .. "/.cache/df-dir-picker"
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

            -- Plain substring, not fuzzy: "backend" matches backend, my-backend
            -- and backend.old, but never scattered letters like "bcknd". Queries
            -- containing "/" work too, since rel is the whole relative path.
            -- Filtering here also means far fewer entries reach the scorer.
            if q == "" or rel:lower():find(q, 1, true) then
                -- Keywords are the searched fields (see SearchPriority above):
                -- the leaf first so an exact directory name wins, then the
                -- relative path so a query spanning segments still matches. Both
                -- are untruncated, so ranking never depends on what survived
                -- eliding.
                local entry = {
                    Text = #rel <= BUDGET and rel or Elide(rel, q),
                    Subtext = path,
                    Keywords = { rel:match("[^/]*$"), rel },
                    Value = path,
                }

                -- Subtext is display-only now that SearchPriority limits scoring
                -- to Keywords; a shared ssh:// prefix on every entry would only
                -- add noise.
                if not IsMirrored(path, home) then
                    entry.Actions = {
                        ["menus:default"] = "setsid uwsm-app -- zeditor "
                            .. ShellEscape(path) .. " >/dev/null 2>&1",
                    }
                end

                entries[#entries + 1] = entry
            end
        end
    end
    handle:close()

    return entries
end
