// The other menu: specific application invocations no desktop entry covers
// (a browser profile or a database client wanting a secret).
// Data only -- see lib/menus.js for what a declaration may contain, and
// Menu.qml for the Provider that runs them.
//
// Three shapes of entry here:
// - Zen: a plain `command` -- must not name `uwsm-app` itself, since Menu.qml
//   already applies the launch prefix.
// - Compass: a `shell` declaration, since it substitutes a command
//   (`$(pass env/mongodb_uri)`) -- the only entry across these menus that needs one.
// - Special Workspace entries: exact identity, workspace, then launch argv;
//   unscoped because Hyprland spawns the surviving process.
Menu {
    label: "other"
    description: "Everything that fits nowhere else"
    subtext: "Other"

    // None of the four entries declares an icon; they fall back to the menu's own.
    icon: "applications-other"

    entries: [
        {
            name: "Zen Browser profile 008",
            keywords: ["zen 008", "008", "zen work profile", "work profile", "job apply"],
            command: ["flatpak", "run", "app.zen_browser.zen", "-P", "008"]
        },
        {
            name: "Zen Browser profile dev",
            keywords: ["zen dev", "dev browser", "zen dev profile", "development browser"],
            command: ["flatpak", "run", "app.zen_browser.zen", "-P", "dev"]
        },
        {
            name: "Zen Browser profile webdev",
            keywords: ["zen webdev", "webdev", "zen webdev profile", "webdev profile"],
            command: ["flatpak", "run", "app.zen_browser.zen", "-P", "webdev"]
        },
        {
            name: "MongoDB Compass env",
            keywords: ["mongodb", "compass"],
            shell: "flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)"
        },
        {
            name: "Helium - work profile",
            keywords: ["helium", "helium work"],
            command: ["~/dotfiles/bin/df-launch-special-workspace", "helium", "work", "helium-browser", "--profile-directory=Profile 2"],
            scoped: false
        }
    ]
}
