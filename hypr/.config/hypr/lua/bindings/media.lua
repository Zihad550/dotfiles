-- swayosd-client scoped to the focused monitor.
local osdclient = [[swayosd-client --monitor "$(hyprctl monitors -j | jq -r '.[] | select(.focused == true).name')"]]

o.bind("XF86AudioRaiseVolume", "Volume up",        osdclient .. " --output-volume raise",      { locked = true, repeating = true })
o.bind("XF86AudioLowerVolume", "Volume down",      osdclient .. " --output-volume lower",      { locked = true, repeating = true })
o.bind("XF86AudioMute",        "Mute",             osdclient .. " --output-volume mute-toggle",{ locked = true, repeating = true })
o.bind("XF86AudioMicMute",     "Mute microphone",  osdclient .. " --input-volume mute-toggle", { locked = true, repeating = true })
o.bind("XF86MonBrightnessUp",  "Brightness up",    osdclient .. " --brightness raise",         { locked = true, repeating = true })
o.bind("XF86MonBrightnessDown","Brightness down",  osdclient .. " --brightness lower",         { locked = true, repeating = true })

o.bind("ALT + XF86AudioRaiseVolume", "Volume up precise",     osdclient .. " --output-volume +1", { locked = true, repeating = true })
o.bind("ALT + XF86AudioLowerVolume", "Volume down precise",   osdclient .. " --output-volume -1", { locked = true, repeating = true })
o.bind("ALT + XF86MonBrightnessUp",  "Brightness up precise", osdclient .. " --brightness +1",    { locked = true, repeating = true })
o.bind("ALT + XF86MonBrightnessDown","Brightness down precise", osdclient .. " --brightness -1",  { locked = true, repeating = true })

o.bind("XF86AudioNext",  "Next track",     osdclient .. " --playerctl next",       { locked = true })
o.bind("XF86AudioPause", "Pause",          osdclient .. " --playerctl play-pause", { locked = true })
o.bind("XF86AudioPlay",  "Play",           osdclient .. " --playerctl play-pause", { locked = true })
o.bind("XF86AudioPrev",  "Previous track", osdclient .. " --playerctl previous",   { locked = true })

o.bind("SUPER + XF86AudioMute", "Switch audio output",
    os.getenv("HOME") .. "/dotfiles/bin/hyprland-cmd-audio-switch",
    { locked = true })
