Name = "dotfilesScreenshots"
NamePretty = "Screenshots"
Icon = "camera-photo"
Cache = false
HideFromProviderlist = false
SearchName = true

-- Menu-level actions: %VALUE% is replaced with entry.Value (screenshot path) at activate time.
-- "menus:default" (Return) copies the image content, "copy_path" (shift Return) copies the file path.
Actions = {
    ["menus:default"] = os.getenv("HOME") .. "/dotfiles/bin/df-screenshot-copy '%VALUE%'",
    ["copy_path"] = "wl-copy '%VALUE%'",
}

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME")
    local dir = home .. "/Pictures/Screenshots"

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
                    Text = filename,
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
