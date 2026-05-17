Name = "dotfilesThemes"
NamePretty = "Themes"
Icon = "preferences-desktop-theme"
Cache = false
HideFromProviderlist = false
SearchName = true

local function ShellEscape(s)
    return "'" .. s:gsub("'", "'\\''") .. "'"
end

function FormatName(name)
    name = name:gsub("-", " ")
    name = name:gsub("%S+", function(word)
        return word:sub(1, 1):upper() .. word:sub(2):lower()
    end)
    return name
end

local function FindPreview(bg_dir, theme)
    local cmd = "find -L " .. ShellEscape(bg_dir)
        .. " -maxdepth 1 -type f \\( "
        .. " -iname " .. ShellEscape(theme .. ".png")
        .. " -o -iname " .. ShellEscape(theme .. ".jpg")
        .. " -o -iname " .. ShellEscape(theme .. ".jpeg")
        .. " -o -iname " .. ShellEscape(theme .. ".webp")
        .. " \\) 2>/dev/null | head -n 1"
    local h = io.popen(cmd)
    if not h then return nil end
    local line = h:read("*l")
    h:close()
    if line and line ~= "" then return line end
    return nil
end

function GetEntries()
    local entries = {}
    local home = os.getenv("HOME") or ""
    local themes_dir = home .. "/.config/themes"
    local theme_link = home .. "/.config/theme"
    local preview_dir = home .. "/.config/theme-previews"
    local setter = home .. "/dotfiles/bin/theme"

    local current = ""
    local link_handle = io.popen("readlink " .. ShellEscape(theme_link) .. " 2>/dev/null")
    if link_handle then
        local target = link_handle:read("*l")
        link_handle:close()
        if target and target ~= "" then
            current = target:match("([^/]+)$") or ""
        end
    end

    local cmd = "find -L " .. ShellEscape(themes_dir)
        .. " -mindepth 2 -maxdepth 2 -name colors.toml 2>/dev/null | sort"
    local handle = io.popen(cmd)
    if handle then
        for line in handle:lines() do
            local theme_path = line:gsub("/colors%.toml$", "")
            local name = theme_path:match("([^/]+)$")
            if name then
                local text = FormatName(name)
                if name == current then
                    text = text .. "  (active)"
                end

                local entry = {
                    Text = text,
                    Subtext = name,
                    Value = name,
                    Actions = {
                        activate = setter .. " " .. ShellEscape(name),
                    },
                }

                local preview = FindPreview(preview_dir, name)
                if preview then
                    entry.Preview = preview
                    entry.PreviewType = "file"
                end

                table.insert(entries, entry)
            end
        end
        handle:close()
    end

    return entries
end
