// The other menu: specific application invocations no desktop entry covers
// (a browser profile, a database client wanting a secret, zellij sessions).
// Data only -- see lib/menus.js for what a declaration may contain, and
// Menu.qml for the Provider that runs them.
//
// Three shapes of entry here:
// - Zen: a plain `command` -- must not name `uwsm-app` itself, since Menu.qml
//   already applies the launch prefix.
// - Compass: a `shell` declaration, since it substitutes a command
//   (`$(pass env/mongodb_uri)`) -- the only entry across these menus that needs one.
// - The df-launch-special-app entries: a whole command line as one array
//   element (Hyprland's exec dispatcher parses it), `scoped: false` because
//   the script itself doesn't stay around -- it asks the compositor to spawn
//   the terminal, so the surviving process is the compositor's child, not
//   one this could scope.
Menu {
    label: "other"
    description: "Everything that fits nowhere else"
    subtext: "Other"

    // None of the five entries declares an icon; they fall back to the menu's own.
    icon: "applications-other"

    entries: [
        {
            name: "Zen Browser profile 008",
            keywords: ["zen 008", "008", "zen work profile", "work profile", "job apply"],
            command: ["flatpak", "run", "app.zen_browser.zen", "-P", "008"]
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
            name: "work - zellij session",
            command: ["~/dotfiles/bin/df-launch-special-app", "work-zellij", "ghostty -e zellij -l work attach --create work-zellij options --on-force-close quit", "work-zellij"],
            scoped: false
        },
        {
            name: "project - zellij session",
            keywords: ["project", "zellij"],
            command: ["~/dotfiles/bin/df-launch-special-app", "project-zellij", "ghostty -e zellij -l project attach --create project-zellij options --on-force-close quit", "project-zellij"],
            scoped: false
        },
        {
            name: "Helium - work profile",
            keywords: ["helium", "helium work"],
            command: ["~/dotfiles/bin/df-launch-special-app", "helium-work", "helium-browser --profile-directory=\"Profile 2\"", "work"],
            scoped: false
        }
    ]
}
