-- Notifications
o.bind("SUPER + COMMA",        "Dismiss last notification", "makoctl dismiss")
o.bind("SUPER + SHIFT + COMMA","Dismiss all notifications", "makoctl dismiss --all")
o.bind("SUPER + CTRL + COMMA", "Toggle silencing notifications",
    [[bash -c "makoctl mode -t do-not-disturb && makoctl mode | grep -q 'do-not-disturb' && notify-send 'Silenced notifications' || notify-send 'Enabled notifications'"]])

-- Dictation
o.bind("SUPER + CTRL + V",  "Dictation start", "voxtype record start")
o.bind("SUPER + SHIFT + V", "Dictation stop",  "voxtype record stop", { release = true })
