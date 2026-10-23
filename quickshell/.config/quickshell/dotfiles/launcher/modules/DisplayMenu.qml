// The display menu: monitor orientation and the saved layout. Data only --
// see lib/menus.js for what a declaration may contain, and Menu.qml for the
// Provider that runs them.
//
// Every command starts with `~`, which argvOf in lib/menus.js expands
// explicitly (nothing else here runs these through a shell).
//
// Commands manage their own lifetime without a systemd scope.
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
        },
        {
            name: "Layout: Arrange displays",
            keywords: ["layout", "arrange", "position", "drag", "edge", "monitor", "displays"],
            icon: "video-display",
            command: ["qs", "-c", "dotfiles", "ipc", "call", "displayArrange", "toggle"],
            scoped: false
        },
        {
            name: "LG input: Toggle VGA / HDMI 1",
            keywords: ["input", "source", "toggle", "vga", "hdmi", "lg", "monitor"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-monitor", "input", "toggle", "--notify"],
            scoped: false
        },
        {
            name: "LG input: VGA",
            keywords: ["input", "source", "vga", "lg", "monitor"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-monitor", "input", "vga", "--notify"],
            scoped: false
        },
        {
            name: "LG input: HDMI 1",
            keywords: ["input", "source", "hdmi", "lg", "monitor"],
            icon: "video-display",
            command: ["~/dotfiles/bin/df-monitor", "input", "hdmi1", "--notify"],
            scoped: false
        }
    ]
}
