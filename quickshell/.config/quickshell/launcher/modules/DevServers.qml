import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/devservers.js" as Dev

// The dev-servers Provider: the machine's dev-server URLs, open one on
// Return. Structurally a menu: a data list and one Action, behaviour in the
// pure module. Provider interface: see docs/launcher-spec.md.
//
// df-launch-dev is the stable way to reach the "localhost" special
// workspace (owns the Lua-vs-legacy dispatch and launch-or-focus), called by
// absolute path since a launcher's PATH doesn't include ~/dotfiles/bin.
NestableProvider {
    id: root

    readonly property string label: "dev servers"
    readonly property string description: "Open a dev server"
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    readonly property var urls: ["https://localhost:5175", "http://localhost:3000", "http://localhost:8000"]

    // Keyed: a URL is a stable identity, and opening a dev server is a
    // genuine recurring choice.
    readonly property var catalog: {
        const built = Catalog.keyedCatalog(root.urls, Dev.entryFor, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys)
        };
    }

    // A function passed between two imported JS modules inside QML's engine
    // fails as an empty list rather than as an error -- this logs a sanity check.
    Component.onCompleted: console.log("launcher: dev servers Provider built",
        root.catalog.entries.length, "Entries; entryFor is a", typeof Dev.entryFor)

    readonly property var actions: ({
        primary: {
            label: "open",
            invoke: entry => root.open(entry)
        }
    })

    function open(entry): void {
        Quickshell.execDetached(Dev.launchArgv(root.home, entry.target.url));
    }
}
