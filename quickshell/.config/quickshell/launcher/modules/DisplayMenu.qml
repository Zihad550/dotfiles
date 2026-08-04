// The display menu: monitor orientation and the saved layout.
//
// Data only -- see lib/menus.js for what a declaration may contain, and
// Menu.qml for the Provider that runs them. Ported from
// elephant/.config/elephant/menus/display.toml (deleted with ticket 19).
//
// Every command here starts with `~`, which elephant expanded by running it
// through a shell. Nothing expands it now, so the path would simply not be
// found -- argvOf in lib/menus.js handles the leading `~` explicitly, and the
// per-entry audit in tests/launcher/menus.test.js pins the expanded path.
//
// All four are `scoped: false`: each one calls hyprctl and exits, so a systemd
// scope around it would be a fork, an exec and a D-Bus round trip for a process
// that is already gone.
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
