Name = "dotfilesBackgrounds"
NamePretty = "Backgrounds"
Icon = "preferences-desktop-wallpaper"
Cache = false
HideFromProviderlist = false
SearchName = true

-- Menu-level action: %VALUE% is replaced with entry.Value (background path) at activate time.
Actions = {
    ["menus:default"] = os.getenv("HOME") .. "/dotfiles/bin/df-theme-bg-set '%VALUE%'",
}

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

function FormatName(filename)
    local name = filename:gsub("%.[^%.]+$", "")
    name = name:gsub("-", " ")
    name = name:gsub("%S+", function(word)
        return word:sub(1, 1):upper() .. word:sub(2):lower()
    end)
    return name
end

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME")
    local bg_dir = home .. "/.config/backgrounds"

    local handle = io.popen(
        "find -L " .. ShellEscape(bg_dir)
        .. " -maxdepth 1 -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \\) 2>/dev/null | sort"
    )
    if handle then
        for background in handle:lines() do
            local filename = background:match("([^/]+)$")
            if filename then
                table.insert(entries, {
                    Text = FormatName(filename),
                    Subtext = filename,
                    Value = background,
                    Preview = background,
                    PreviewType = "file",
                })
            end
        end
        handle:close()
    end

    return entries
end
