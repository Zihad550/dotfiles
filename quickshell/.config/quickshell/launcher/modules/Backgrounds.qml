import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/backgrounds.js" as Bgs
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching

// The backgrounds Provider: every image under ~/.config/backgrounds, reached
// by being entered from the "?" provider list. Provider interface: see
// docs/launcher-spec.md. Structurally identical to Themes.qml, one property
// lighter (no active-marker, see lib/backgrounds.js's header). Out of
// `pool`, no `prefix`, `layout: "preview"`, entered rather than routed to --
// previews matter more here than anywhere, since one background is told
// from another by looking at it and nothing else.
NestableProvider {
    id: root

    readonly property string label: "backgrounds"
    readonly property string description: "Set the desktop background"
    readonly property string layout: "preview"

    // Never "not ready": an empty ~/.config/backgrounds is legitimate.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // A plain string, not the parsed list, so re-parsing happens only where needed.
    property string listingText: ""
    readonly property var paths: Bgs.parseListing(root.listingText)

    property string loggedState: ""
    onPathsChanged: {
        const state = String(root.paths.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: backgrounds Provider sees", root.paths.length, "background(s)");
    }

    // `owners`: textsFor gives a background two corpus texts (raw stem, formatted name).
    readonly property var catalog: {
        const built = Catalog.ownedCatalog(root.paths,
            path => Bgs.entryFor(path, root),
            path => Bgs.textsFor(path));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    readonly property var actions: ({
        primary: {
            label: "set",
            invoke: entry => root.apply(entry)
        },

        back: {
            label: "back",
            invoke: () => root.leave()
        }
    })

    function apply(entry): void {
        Quickshell.execDetached(Bgs.applyArgv(root.home, entry.target.path));
    }

    // Called at startup and on every open.
    property bool refreshPending: false

    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Bgs.listCommand(root.home);
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    // QtObject has no default property to nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped: an empty list already says plainly that
        // nothing was found.
        stderr: StdioCollector {}

        // Not a duplicate of onStreamFinished. Drains `refreshPending`.
        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
