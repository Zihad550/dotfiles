import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/menus.js" as Menus

// A static menu Provider: a hand-maintained list of things to run.
//
// One of these per menu, each a data file next to this one -- SystemMenu.qml,
// MediaMenu.qml, DisplayMenu.qml, OtherMenu.qml. This is the whole of the
// behaviour; those four are nothing but `entries`. Adding an entry is editing
// one of them and Quickshell reloading it: no restart, no build step, and a
// syntax error is a config-load failure the reload reports rather than a row
// that misbehaves later.
//
// The Provider interface it fills -- label, ready, catalog, actions, and the
// shape of an Entry -- is documented at the top of Applications.qml. The rules
// about what a declared entry means, and which declarations are refused, are in
// lib/menus.js, which is where their tests can reach them.
//
// These replace elephant's menus/*.toml. The shape changed on two points, both
// deliberate:
//
// **A command is argv, not a command line.** Elephant ran every entry through
// `sh -c`; nothing here does unless the entry asks for it with `shell`. Three of
// the ported entries carry an argument with spaces and quotes inside it, and
// those arrive intact as one array element rather than depending on quoting
// surviving two layers.
//
// **The launch prefix is the Provider's to apply.** One ported entry named
// `uwsm-app` itself because elephant gave it none; the prefix lives here now,
// so no entry spells it. *Whether* to apply it is still per entry -- `scoped:
// false` opts out -- because `uwsm stop` must not run inside a scope of the
// session it stops. See argvOf in lib/menus.js.
NestableProvider {
    id: root

    // What this menu is called, in the "waiting for …" message and in the Entry
    // Keys. Lowercase and stable: renaming it discards the menu's accumulated
    // Frecency, since every key is built from it.
    required property string label

    // What the Entries show as their sub-line. These merge into one ranked list
    // with applications and windows, so "Restart" needs to say which menu it
    // came from.
    required property string subtext

    // The icon an entry declaring none falls back to, as elephant's menus did.
    // Only the other menu needs one -- every entry in the other three names its
    // own -- so this defaults to no icon rather than being required.
    property string icon: ""

    // The one-line summary the "?" provider list shows -- ticket 18. Declared
    // here so all four menus get it from their own data file, and defaulted to
    // "" rather than required, because a menu that has not written one should
    // still list (with just its name) rather than fail to load.
    property string description: ""

    // The menu itself. See lib/menus.js for what a declaration may contain.
    required property var entries

    // Always. A static menu has nothing to load, so there is no state in which
    // emptiness means "not yet" -- which is the only thing this reports.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // Same prefix, and for the same reasons, as Applications.launchPrefix --
    // see the note there. Applied per entry: `scoped: false` skips it, which is
    // what keeps `uwsm stop` from running inside a scope it is about to tear
    // down.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    // Same shape and the same single-property reasoning as
    // Applications.catalog: read once, so the indices rank() returns cannot be
    // paired with a different entry list than the corpus was prepared from.
    //
    // A binding over `entries`, so editing the data file re-ranks without
    // anything else being told.
    //
    // An entry is findable by its keywords as well as its name, so this corpus
    // carries an `owners` array and its consumer collapses those back to
    // Entries -- the same arrangement as the windows Provider.
    readonly property var catalog: {
        const built = Menus.catalogOf({
            name: root.label,
            subtext: root.subtext,
            icon: root.icon,
            entries: root.entries
        }, root, root.home, root.launchPrefix);

        // Reported here, once per catalog build, which is when the config
        // loads. The alternative is a row that renders perfectly and does
        // nothing when its key is pressed -- indistinguishable from the
        // Launcher ignoring you, which is the failure this Provider is shaped
        // around.
        built.problems.forEach(problem => console.warn("launcher:", problem));

        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Primary only. Secondary has no second sense here -- there is one thing to
    // do with "Shutdown" -- so Shift+Return over a menu Entry does nothing, and
    // does it without an error.
    readonly property var actions: ({
        primary: {
            label: "run",
            invoke: entry => root.run(entry)
        }
    })

    function run(entry): void {
        const argv = entry.target.argv;

        // Cannot happen for an Entry that exists: catalogOf drops a declaration
        // whose command it could not build. Kept because the two are separate
        // functions, and a silent no-op is exactly what this Provider must not
        // do.
        if (argv.length === 0) {
            console.warn("launcher:", root.label, "menu entry", entry.name, "has no command to run");
            return;
        }

        Quickshell.execDetached(argv);
    }
}
