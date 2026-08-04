import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/backgrounds.js" as Bgs
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching

// The backgrounds Provider: every image under ~/.config/backgrounds, reached
// by being entered from the provider list behind "?" -- ticket 15's "set a
// background from the Launcher" (spec story 39), placed by ticket 18.
//
// The Provider interface it fills -- label, ready, catalog, actions, refresh
// -- is documented at the top of Applications.qml. Structurally identical to
// Themes.qml, one property lighter: no active-theme-style marker (see the
// header on lib/backgrounds.js). Out of `pool`, no `prefix`, `layout:
// "preview"`, entered rather than routed to -- all four for the reasons set
// out at length on Themes.qml; this Provider is the other half of the same
// decision, and previews matter more here than anywhere, since one background
// is told from another by looking at it and by nothing else.
//
// **df-theme-bg-picker is gone.** It was the standalone walker-driven picker,
// a separate Surface with its own entry point through walker/elephant, not
// this Launcher; it and the elephant menu behind it are deleted with ticket
// 19. This Provider is that picker's replacement -- the one way to set a
// background by choosing it.
NestableProvider {
    id: root

    readonly property string label: "backgrounds"

    // Both shown by the provider list behind "?" -- see the notes on the
    // matching properties in Themes.qml.
    readonly property string description: "Set the desktop background"
    readonly property string layout: "preview"

    // Never "not ready" -- an empty ~/.config/backgrounds is legitimate, not
    // a fault to report. Same reasoning as Themes.qml's own `ready`.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // Fed by the Process below. A plain string rather than the parsed list,
    // so re-parsing only happens in the one binding that needs it.
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

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from. `owners`, because textsFor gives a background two
    // corpus texts (its raw stem and its formatted display name).
    readonly property var catalog: {
        const built = Catalog.ownedCatalog(root.paths,
            path => Bgs.entryFor(path, root),
            path => Bgs.textsFor(path));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Setting a background is the primary; `back` leaves the sub-view. Both
    // unconditional, for the reason spelled out on Themes.qml's own actions.
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

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Called at startup and again on every open, the same as
    // Themes.qml's own refresh.
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

    // Assigned to a property rather than nested bare, the same reason
    // Themes.qml's own Process is: QtObject has no default property to nest
    // a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped, the same as Themes.qml's own `finder`: an
        // empty list already says plainly that nothing was found.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and not a duplicate of the
        // collector's own handler -- the same reasoning as Themes.qml's own
        // `onExited`. Drains `refreshPending`: a refresh() that arrived
        // while this run was already in flight gets the fresh run it asked
        // for, once this one is out of the way.
        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
