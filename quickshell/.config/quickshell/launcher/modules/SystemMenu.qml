// The system menu: locking, sleeping, and ending the session. Data only --
// see lib/menus.js for what a declaration may contain, and Menu.qml for the
// Provider that runs them.
//
// Every entry is `scoped: false`: `uwsm stop` (Relaunch) tears
// down the session, so running it inside a scope of that session means
// asking systemd to kill the process doing the asking; the systemctl
// entries are one-shot commands a scope buys nothing for either. Lock calls
// the Session Lock's existing process over IPC.
Menu {
    label: "system"
    description: "Lock, suspend, restart, log out"
    subtext: "System"

    entries: [
        {
            name: "Lock",
            keywords: ["lock", "lock screen"],
            icon: "system-lock-screen",
            command: ["qs", "-c", "lock", "ipc", "call", "lock", "lock"],
            scoped: false
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
