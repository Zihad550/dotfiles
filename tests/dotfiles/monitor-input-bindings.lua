for _, profile in ipairs({ "arch-workstation", "arch-devbox", "ubuntu-lxc-devbox" }) do
    local calls = {}
    local getenv = os.getenv
    os.getenv = function(key)
        if key == "DOTFILES_PROFILE" then return profile end
        return getenv(key)
    end
    o = {
        bind = function(key, label, command) calls[key] = command end,
        cmd_present = function() return false end,
    }
    hl = { dsp = { global = function(name) return name end } }
    dofile("hypr/.config/hypr/lua/bindings/utilities.lua")
    os.getenv = getenv
    assert(calls["SUPER + CTRL + I"] == getenv("HOME") .. "/dotfiles/bin/df-monitor input toggle --notify",
        "LG input toggle is missing on " .. profile)
end
print("LG input shortcut is available on every profile")
