Name = "dotfilesScreenshots"
NamePretty = "Screenshots"
Icon = "camera-photo"
Cache = false
HideFromProviderlist = false
SearchName = true

-- Elephant scores an empty query as 0 for every entry and tie-breaks alphabetically
-- by Text, which throws away the newest-first order GetEntries builds below.
-- FixedOrder scores entries by their position instead, so the list stays newest
-- first. It only covers the empty query; typing switches to fuzzy relevance.
-- Depends on Cache = false above: with caching, GetEntries runs once at startup
-- and the order would freeze at that moment's mtimes.
FixedOrder = true

-- Menu-level actions: %VALUE% is replaced with entry.Value (screenshot path) at activate time.
-- "menus:default" (Return) copies the image content, "copy_path" (shift Return) copies the
-- file path, "mark" (Tab) toggles the entry in the selection list. Walker has no native
-- multi-select, so "mark" writes to a runtime file and reloads the list to redraw the ticks;
-- "copy_path" then copies the whole selection when one exists.
Actions = {
    ["menus:default"] = os.getenv("HOME") .. "/dotfiles/bin/df-screenshot-copy '%VALUE%'",
    ["copy_path"] = os.getenv("HOME") .. "/dotfiles/bin/df-screenshot-copy-paths '%VALUE%'",
    ["mark"] = os.getenv("HOME") .. "/dotfiles/bin/df-screenshot-mark '%VALUE%'",
}

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function MarkedPaths()
    local marked = {}
    local runtime = os.getenv("XDG_RUNTIME_DIR") or "/tmp"
    local f = io.open(runtime .. "/df-screenshot-marks", "r")
    if f then
        for line in f:lines() do
            if line ~= "" then marked[line] = true end
        end
        f:close()
    end
    return marked
end

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME")
    local dir = home .. "/Pictures/Screenshots"
    local marked = MarkedPaths()

    -- newest first
    local handle = io.popen(
        "find -L " .. ShellEscape(dir)
        .. " -maxdepth 1 -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \\)"
        .. " -printf '%T@\\t%TY-%Tm-%Td %TH:%TM\\t%p\\n' 2>/dev/null | sort -rn"
    )
    if handle then
        for line in handle:lines() do
            local mtime, path = line:match("^[^\t]+\t([^\t]+)\t(.+)$")
            if path then
                local filename = path:match("([^/]+)$")
                table.insert(entries, {
                    Text = marked[path] and ("✓ " .. filename) or filename,
                    Subtext = mtime,
                    Value = path,
                    Preview = path,
                    PreviewType = "file",
                })
            end
        end
        handle:close()
    end

    return entries
end
