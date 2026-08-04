// The other menu: the specific application invocations that no desktop entry
// covers -- a browser profile, a database client wanting a secret, the two
// zellij sessions.
//
// Data only -- see lib/menus.js for what a declaration may contain, and
// Menu.qml for the Provider that runs them. Ported from
// elephant/.config/elephant/menus/other.toml (deleted with ticket 19), whose
// commented-out entries are
// deliberately not ported: they are not entries this menu has today.
//
// This menu is where the port had to decide per entry, and the three shapes are
// all here:
//
// - **Zen** named `uwsm-app` itself, because elephant applied no launch prefix.
//   Menu.qml applies it now, so the data must not -- keeping it would run
//   `uwsm-app -- uwsm-app -- flatpak run …`.
// - **Compass** substitutes a command, `$(pass env/mongodb_uri)`, so it is a
//   `shell` declaration. It is the only entry in the four menus that genuinely
//   needs one.
// - **The three df-launch-special-app entries** pass a whole command line as a
//   single argument, one of them with quotes inside it. Those were shell
//   quoting before and are one array element now, which is stronger: nothing
//   re-splits them. The script hands that argument on to Hyprland's exec
//   dispatcher, which is what parses it.
//
// The df-launch-special-app entries are `scoped: false` because the script does
// not stay around -- it asks the compositor to spawn the terminal, so the
// process that survives is the compositor's child, not one this could scope.
Menu {
    label: "other"
    description: "Everything that fits nowhere else"
    subtext: "Other"

    // None of the five entries declares an icon, and none did in the TOML
    // either -- they inherited the menu's, because elephant fell an entry's
    // icon back to its menu's
    // (resources/elephant/internal/providers/menus/setup.go:369-372 -- that
    // checkout is deleted with ticket 19). So this
    // is what they render as today, and dropping it would have been five blank
    // slots that nothing in the port would have called a change.
    icon: "applications-other"

    entries: [
        {
            name: "Zen Browser profile 008",
            keywords: ["zen 008", "008", "zen work profile", "work profile", "job apply"],
            command: ["flatpak", "run", "app.zen_browser.zen", "-P", "008"]
        },
        {
            name: "MongoDB Compass env",
            keywords: ["mongodb", "compass"],
            shell: "flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)"
        },
        {
            name: "work - zellij session",
            keywords: ["work", "mamacrm", "zellij"],
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
