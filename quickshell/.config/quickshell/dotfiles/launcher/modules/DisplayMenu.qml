// The display menu: monitor orientation and the saved layout. Data only --
// see lib/menus.js for what a declaration may contain, and Menu.qml for the
// Provider that runs them.
//
// Every command starts with `~`, which argvOf in lib/menus.js expands
// explicitly (nothing else here runs these through a shell).
//
// All four are `scoped: false`: each calls hyprctl and exits, so a systemd
// scope around it would be a fork, exec and D-Bus round trip for a process
// that's already gone.
Menu {
    label: "display"
    description: "Brightness, night light, monitors"
    subtext: "Display"

    entries: [
        {
            name: "HDMI-A-1: Toggle orientation",
            keywords: ["rotate", "orientation", "toggle", "hdmi", "monitor"],
            icon: "object-rotate-right",
            command: ["~/dotfiles/bin/df-hypr-display-rotate", "toggle"],
            scoped: false
        },
        {
            name: "HDMI-A-1: Horizontal",
            keywords: ["horizontal", "landscape", "hdmi", "monitor"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-hypr-display-rotate", "horizontal"],
            scoped: false
        },
        {
            name: "HDMI-A-1: Vertical",
            keywords: ["vertical", "portrait", "hdmi", "monitor"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-hypr-display-rotate", "vertical"],
            scoped: false
        },
        {
            name: "Layout: Restore saved",
            keywords: ["layout", "restore", "apply", "saved", "monitor", "displays"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-hypr-display-layout", "apply"],
            scoped: false
        }
    ]
}
