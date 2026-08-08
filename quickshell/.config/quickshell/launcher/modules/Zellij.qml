import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/zellij.js" as Z

// The zellij Provider: the session layouts, attach (or start) one on Return.
// Structurally this is the dev-servers Provider: a data list and one Action,
// behaviour in the pure module. Provider interface: see docs/launcher-spec.md.
//
// A session that isn't running is still worth an Entry: the command is
// attach-or-create, so this lists the *ability to work on a session*, not
// just the ones currently attached.
NestableProvider {
    id: root

    readonly property string label: "zellij"
    readonly property string description: "Attach to a zellij session"
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    readonly property var sessions: ["work", "project", "dev"]

    // Keyed: a session name is a stable identity, and attaching to it is a
    // genuine recurring choice.
    readonly property var catalog: {
        const built = Catalog.keyedCatalog(root.sessions, Z.entryFor, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys)
        };
    }

    // A function passed between two imported JS modules inside QML's engine
    // fails as an empty list rather than as an error -- this logs a sanity check.
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
