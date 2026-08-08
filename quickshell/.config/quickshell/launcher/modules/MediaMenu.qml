// The media menu: the audio mixer. Data only -- see lib/menus.js for what a
// declaration may contain, and Menu.qml for the Provider that runs them.
//
// The command is a fix, not a carryover: the original config declared an
// empty action, which silently did nothing -- the action *name* is what it
// was meant to run, and it's the command now.
//
// Duplicates the applications Provider, which already offers pavucontrol
// with a better icon. Kept rather than deleted -- see .scratch/launcher/issues/08.
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
