import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/zellij.js" as Z

// The zellij Provider: the session layouts, attach (or start) one on Return
// -- ticket 16's bin/walker/zellij-sessions (deleted) as a Provider.
//
// The Provider interface it fills -- label, ready, catalog, actions -- is
// documented at the top of Applications.qml. Structurally this is the
// dev-servers Provider: a data list and one Action, with the behaviour in
// the pure module.
//
// **The session names are data, declared here** -- the script hardcoded the
// same three -- and this is where they hot-reload. The part worth testing is
// the argv, which is lib/zellij.js: the command travels as one argument
// through df-launch-special-app into Hyprland's exec dispatcher, and the
// quoting is what a unit test can actually catch.
//
// **A session that is not running is still worth an Entry.** The command is
// attach-or-create (`zellij ... attach --create <name>`), so the Entry starts
// the session when it is not there and joins it when it is -- the Provider
// lists the *ability to work on this session*, not the sessions currently
// attached.
NestableProvider {
    id: root

    readonly property string label: "zellij"

    readonly property string description: "Attach to a zellij session"

    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // The script's list, exactly.
    readonly property var sessions: ["work", "project", "dev"]

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from. Keyed -- a session name is a stable identity, and
    // attaching to your work session is a genuine recurring choice.
    //
    // The build itself is the shared keyed-catalog one, handed this Provider's
    // own entryFor -- see lib/catalog.js for why it is passed rather than
    // wrapped.
    readonly property var catalog: {
        const built = Catalog.keyedCatalog(root.sessions, Z.entryFor, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys)
        };
    }

    // The same startup check DevServers.qml makes, for the same reason: a
    // function passed between two imported JS modules inside QML's engine
    // fails as an empty list rather than as an error.
    Component.onCompleted: console.log("launcher: zellij Provider built",
        root.catalog.entries.length, "Entries; entryFor is a", typeof Z.entryFor)

    readonly property var actions: ({
        primary: {
            label: "attach",
            invoke: entry => root.attach(entry)
        }
    })

    function attach(entry): void {
        Quickshell.execDetached(Z.launchArgv(root.home, entry.target.session));
    }
}
