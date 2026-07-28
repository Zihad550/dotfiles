-- Notifications
-- mako, replaced by the quickshell notification daemon
-- (quickshell/.config/quickshell/dotfiles/modules/NotificationDaemon.qml).
-- `qs ipc call` exits 0 even when the target does not exist, so these fail
-- silently if the handler is missing -- verify with `qs -c dotfiles ipc show`.
-- o.bind("SUPER + COMMA",        "Dismiss last notification", "makoctl dismiss")
-- o.bind("SUPER + SHIFT + COMMA","Dismiss all notifications", "makoctl dismiss --all")
-- o.bind("SUPER + CTRL + COMMA", "Toggle silencing notifications",
--     [[bash -c "makoctl mode -t do-not-disturb && makoctl mode | grep -q 'do-not-disturb' && notify-send 'Silenced notifications' || notify-send 'Enabled notifications'"]])
o.bind("SUPER + COMMA",        "Dismiss last notification", "qs -c dotfiles ipc call notifications dismissLast")
o.bind("SUPER + SHIFT + COMMA","Dismiss all notifications", "qs -c dotfiles ipc call notifications dismissAll")
-- toggleDnd fires its own confirmation notification, which the daemon lets
-- through do-not-disturb the way mako's app-name=notify-send exception did.
o.bind("SUPER + CTRL + COMMA", "Toggle silencing notifications",
    "qs -c dotfiles ipc call notifications toggleDnd")

-- Dictation
o.bind("SUPER + CTRL + V",  "Dictation start", "voxtype record start")
o.bind("SUPER + SHIFT + V", "Dictation stop",  "voxtype record stop", { release = true })
