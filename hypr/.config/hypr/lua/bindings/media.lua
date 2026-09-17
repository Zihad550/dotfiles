local home         = os.getenv("HOME")
local dotfiles_bin = home .. "/dotfiles/bin"

-- Steps stay positive with the direction in the function name: a `-5` argument
-- would be read as an option by the ipc CLI, not as a value.
local osd = "qs -c dotfiles ipc call osd"

o.bind("XF86AudioRaiseVolume", "Volume up",        osd .. " volumeRaise 5",     { locked = true, repeating = true })
o.bind("XF86AudioLowerVolume", "Volume down",      osd .. " volumeLower 5",     { locked = true, repeating = true })
o.bind("XF86AudioMute",        "Mute",             osd .. " volumeMute",        { locked = true, repeating = true })
o.bind("XF86AudioMicMute",     "Mute microphone",  osd .. " micMute",           { locked = true, repeating = true })
o.bind("XF86MonBrightnessUp",  "Brightness up",    osd .. " brightnessRaise 5", { locked = true, repeating = true })
o.bind("XF86MonBrightnessDown","Brightness down",  osd .. " brightnessLower 5", { locked = true, repeating = true })

o.bind("ALT + XF86AudioRaiseVolume", "Volume up precise",     osd .. " volumeRaise 1",     { locked = true, repeating = true })
o.bind("ALT + XF86AudioLowerVolume", "Volume down precise",   osd .. " volumeLower 1",     { locked = true, repeating = true })
o.bind("ALT + XF86MonBrightnessUp",  "Brightness up precise", osd .. " brightnessRaise 1", { locked = true, repeating = true })
o.bind("ALT + XF86MonBrightnessDown","Brightness down precise", osd .. " brightnessLower 1", { locked = true, repeating = true })

o.bind("XF86AudioNext",  "Next track",     osd .. " player next",       { locked = true })
o.bind("XF86AudioPause", "Pause",          osd .. " player play-pause", { locked = true })
o.bind("XF86AudioPlay",  "Play",           osd .. " player play-pause", { locked = true })
o.bind("XF86AudioPrev",  "Previous track", osd .. " player previous",   { locked = true })

if os.getenv("DOTFILES_PROFILE") == "arch-workstation" then
    local media = "qs -c dotfiles ipc call media"
    o.bind("ALT + XF86AudioPlay", "Next track", media .. " next", { locked = true })
    o.bind("ALT + SHIFT + XF86AudioPlay", "Previous track", media .. " previous", { locked = true })
    o.bind("SHIFT + XF86AudioPause", "Switch media source", media .. " sourceSwitch", { locked = true })
    o.bind("SHIFT + XF86AudioPlay", "Switch media source", media .. " sourceSwitch", { locked = true })
end

o.bind("SUPER + XF86AudioMute", "Switch audio output",
    dotfiles_bin .. "/df-hypr-audio-switch",
    { locked = true })
