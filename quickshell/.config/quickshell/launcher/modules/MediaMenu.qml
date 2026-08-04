// The media menu: the audio mixer.
//
// Data only -- see lib/menus.js for what a declaration may contain, and
// Menu.qml for the Provider that runs them. Ported from
// elephant/.config/elephant/menus/media.toml (deleted with ticket 19).
//
// **The command is new, and that is a fix rather than a change.** The TOML
// declared `actions = {"pavucontrol" = ""}` -- an empty command. Elephant falls
// through an empty entry action to the menu's own, then to the menu default,
// and returns without running anything when all three are empty
// (resources/elephant/internal/providers/menus/setup.go:115-146 -- that
// checkout is deleted with ticket 19), which is this
// entry's case. So the one entry in this menu has been doing nothing for as
// long as it has existed; the action *name* is what says what it was meant to
// do, and it is the command now.
//
// **It duplicates the applications Provider**, which already offers pavucontrol
// from its desktop entry with a better icon and no menu around it. Recorded for
// merging in .scratch/launcher/issues/08 rather than deleted here: this ticket
// ports the four menus as they are, and deciding that a whole menu goes away is
// not a decision to take inside the port.
Menu {
    label: "media"
    description: "Playback and volume"
    subtext: "Multi Media"

    entries: [
        {
            name: "Multi media",
            keywords: ["multi media", "media", "sound", "speaker"],
            icon: "multimedia-volume-control",
            command: ["pavucontrol"]
        }
    ]
}
