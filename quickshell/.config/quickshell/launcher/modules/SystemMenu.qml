// The system menu: locking, sleeping, and ending the session.
//
// Data only. What a declaration may contain is documented in lib/menus.js;
// Menu.qml is the Provider that runs them. Ported from
// elephant/.config/elephant/menus/system.toml (deleted with ticket 19).
//
// The icons changed. The TOML carried nerd-font glyphs in the icon field, which
// worked because walker rendered that field as text; the Launcher resolves it
// as an icon-*theme* name, so a glyph there is a name nothing has and renders as
// a blank slot. These are the freedesktop names for the same five things.
//
// Every entry here except Lock is `scoped: false`, and Relaunch is the reason
// the field exists: `uwsm stop` tears down the session, and running it inside a
// scope of that session means asking systemd to kill the process doing the
// asking. The three systemctl entries are one-shot commands that exit
// immediately, so a scope buys them nothing either. Lock keeps it -- hyprlock
// is long-lived, and a Launcher restart must not unlock the screen.
Menu {
    label: "system"
    description: "Lock, suspend, restart, log out"
    subtext: "System"

    entries: [
        {
            name: "Lock",
            keywords: ["lock", "lock screen"],
            icon: "system-lock-screen",
            command: ["hyprlock"]
        },
        {
            name: "Suspend",
            keywords: ["suspend", "suspend system"],
            icon: "system-suspend",
            command: ["systemctl", "suspend"],
            scoped: false
        },
        {
            name: "Restart",
            keywords: ["restart", "reboot"],
            icon: "system-reboot",
            command: ["systemctl", "reboot"],
            scoped: false
        },
        {
            name: "Shutdown",
            keywords: ["shutdown", "power off"],
            icon: "system-shutdown",
            command: ["systemctl", "poweroff"],
            scoped: false
        },
        {
            name: "Relaunch",
            keywords: ["logout", "exit", "relaunch"],
            icon: "system-log-out",
            command: ["uwsm", "stop"],
            scoped: false
        },
    ]
}
