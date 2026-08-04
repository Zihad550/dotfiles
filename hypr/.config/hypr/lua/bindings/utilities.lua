-- Notifications
-- `qs ipc call` exits 0 even when the target does not exist, so these fail
-- silently if the handler is missing -- verify with `qs -c dotfiles ipc show`.
o.bind("SUPER + COMMA",        "Dismiss last notification", "qs -c dotfiles ipc call notifications dismissLast")
o.bind("SUPER + SHIFT + COMMA","Dismiss all notifications", "qs -c dotfiles ipc call notifications dismissAll")
-- toggleDnd fires its own confirmation notification, which the daemon
-- deliberately lets through do-not-disturb.
o.bind("SUPER + CTRL + COMMA", "Toggle silencing notifications",
    "qs -c dotfiles ipc call notifications toggleDnd")

-- Dictation
-- "Dictation start" used to claim SUPER + CTRL + V, which collided with the
-- clipboard manager keybind (bindings/clipboard.lua) on the same combo --
-- Hyprland fired this one instead, so the launcher's clipboard Provider never
-- saw the keypress. Disabled in favor of the clipboard manager.
-- o.bind("SUPER + CTRL + V",  "Dictation start", "voxtype record start")
o.bind("SUPER + SHIFT + V", "Dictation stop",  "voxtype record stop", { release = true })
