import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/displays.js" as Displays

// Connected outputs from Hyprland. Return toggles the selected output and
// refreshes the list after the compositor finishes applying the change.
NestableProvider {
    id: root

    readonly property string label: "monitors"
    readonly property string description: "Turn connected displays on or off"
    readonly property bool ready: true
    readonly property string home: Quickshell.env("HOME")

    property string listingText: ""
    readonly property var listing: Displays.parseListing(root.listingText)

    property string loggedState: ""
    onListingChanged: {
        const state = String(root.listing.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: monitors Provider sees", root.listing.length, "display(s)");
    }

    readonly property var catalog: {
        const built = Catalog.ownedCatalog(root.listing,
            item => Displays.entryFor(item, root),
            (item, entry) => Displays.textsFor(item, entry));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    readonly property var actions: ({
        primary: {
            label: "toggle",
            invoke: entry => root.toggleDisplay(entry),
            after: "stay"
        }
    })

    property string togglingName: ""

    function toggleDisplay(entry): void {
        if (toggler.running)
            return;
        root.togglingName = entry.target.name;
        toggler.command = Displays.toggleArgv(root.home, root.togglingName);
        toggler.running = true;
    }

    readonly property Process toggler: Process {
        id: toggler

        stdout: StdioCollector {}
        stderr: StdioCollector { id: toggleError }

        onExited: exitCode => {
            if (exitCode !== 0)
                Quickshell.execDetached(Displays.failureArgv(
                    root.togglingName, toggleError.text, exitCode));
            root.togglingName = "";
            root.refresh();
        }
    }

    property bool refreshPending: false

    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Displays.listArgv(root.home);
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        stderr: StdioCollector {}

        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
