-- Copy / Paste. Uses the down/timer/up workaround for hyprwm/Hyprland#14099
-- (sendshortcut alone can leave the synthetic key stuck/repeating).
o.bind("SUPER + C", "Universal copy", o.send_shortcut_once("CTRL", "Insert"))
o.bind("SUPER + V", "Universal paste", o.send_shortcut_once("SHIFT", "Insert"))

-- Dispatches straight into the running Launcher process, on its own prefix --
-- see quickshell/.config/quickshell/launcher/shell.qml's second
-- GlobalShortcut (appid "launcher", name "clipboard").
o.bind("SUPER + CTRL + V", "Clipboard manager", hl.dsp.global("launcher:clipboard"))
