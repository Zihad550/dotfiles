import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/menus.js" as Menus

// A static menu Provider: a hand-maintained list of things to run. One of
// these per menu (SystemMenu.qml, MediaMenu.qml, DisplayMenu.qml,
// OtherMenu.qml), each just a data file -- adding an entry means editing one
// of them and letting Quickshell reload it. Provider interface: see
// docs/launcher-spec.md.
//
// A command is argv, not a shell command line -- nothing runs through `sh -c`
// unless the entry asks for it with `shell`. The launch prefix (uwsm-app) is
// the Provider's to apply, not the entry's; `scoped: false` opts an entry out
// (`uwsm stop` must not run inside a scope of the session it's stopping). See
// argvOf in lib/menus.js.
NestableProvider {
    id: root

    // Lowercase and stable: renaming discards the menu's accumulated
    // Frecency, since every Entry Key is built from it.
    required property string label

    // Sub-line shown in the merged pool, so e.g. "Restart" says which menu it
    // came from.
    required property string subtext

    // Fallback icon for an entry declaring none.
    property string icon: ""

    // Shown in the "?" provider list. Defaults to "" rather than required, so
    // a menu without one still lists.
    property string description: ""

    // See lib/menus.js for what a declaration may contain.
    required property var entries

    // Always: a static menu has nothing to load, so there's no "not yet" state.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    readonly property var launchPrefix: ["uwsm-app", "--"]

    // An entry is findable by its keywords as well as its name, so this
    // corpus carries an `owners` array (same arrangement as the windows Provider).
    readonly property var catalog: {
        const built = Menus.catalogOf({
            name: root.label,
            subtext: root.subtext,
            icon: root.icon,
            entries: root.entries
        }, root, root.home, root.launchPrefix);

        // Reported once per catalog build (config load) rather than left to
        // fail silently when the row's key is pressed.
        built.problems.forEach(problem => console.warn("launcher:", problem));

        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Primary only -- there's one thing to do with "Shutdown".
    readonly property var actions: ({
        primary: {
            label: "run",
            invoke: entry => root.run(entry)
        }
    })

    function run(entry): void {
        const argv = entry.target.argv;

        // Can't happen for an Entry that exists (catalogOf drops a
        // declaration whose command it couldn't build), but a silent no-op
        // is worse than a loud warning.
        if (argv.length === 0) {
            console.warn("launcher:", root.label, "menu entry", entry.name, "has no command to run");
            return;
        }

        Quickshell.execDetached(argv);
    }
}
