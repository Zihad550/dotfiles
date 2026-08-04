import QtQuick
import Quickshell
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/devservers.js" as Dev

// The dev-servers Provider: the machine's dev-server URLs, open one on
// Return -- ticket 16's bin/walker/dev-servers (deleted) as a Provider.
//
// The Provider interface it fills -- label, ready, catalog, actions -- is
// documented at the top of Applications.qml. Structurally this is a menu:
// a data list and one Action, with the behaviour in the pure module.
//
// **The URLs are data, declared here** -- the script hardcoded the same
// three -- and this is where they hot-reload, the same reason the four
// static menus keep their Entries in QML. The part worth testing is what a
// Entry says and exactly what a key press runs, which is lib/devservers.js.
//
// **df-launch-dev survives; the script is what was deleted.** The helper is
// the stable way to reach the "localhost" special workspace -- it owns the
// Lua-vs-legacy dispatch and the launch-or-focus behaviour -- and the
// Provider calls it by absolute path, the same rule Themes.qml applies to
// df-theme-set, because a launcher's PATH does not include ~/dotfiles/bin.
NestableProvider {
    id: root

    readonly property string label: "dev servers"

    readonly property string description: "Open a dev server"

    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // The script's list, exactly.
    readonly property var urls: ["https://localhost:5175", "http://localhost:3000", "http://localhost:8000"]

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from. Keyed -- a URL is a stable identity, and opening a dev
    // server is a genuine recurring choice, so Frecency has something to
    // accumulate against here, unlike the windows or workspaces Providers.
    // The shared keyed-catalog build, handed this Provider's own entryFor --
    // see lib/catalog.js for why it is passed rather than wrapped.
    readonly property var catalog: {
        const built = Catalog.keyedCatalog(root.urls, Dev.entryFor, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys)
        };
    }

    // Says outright that the shared catalog build got a function to call, the
    // same kind of startup check the windows and workspaces Providers make: a
    // JS function passed *between* two imported modules inside QML's engine is
    // the one new thing here, and getting it wrong presents as an empty list
    // rather than as an error.
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
