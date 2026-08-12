import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/keybindings.js" as Keybindings

// Live source rationale: docs/adr/0006-keybindings-provider-live-source.md.
QtObject {
    id: root

    readonly property string label: "keybindings"
    readonly property string description: "Search Hyprland keybindings"
    readonly property string prefix: "!"
    // The initial empty listing is not a valid answer until hyprctl has
    // returned once; after that, an empty bind list is legitimate.
    property bool loaded: false
    readonly property bool ready: root.loaded

    property string listingText: ""
    readonly property var binds: Keybindings.parseListing(root.listingText)

    readonly property var catalog: {
        const built = Keybindings.catalogOf(root.binds, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    readonly property var actions: ({
        primary: {
            label: "copy",
            invoke: entry => root.copy(entry)
        },
        secondary: {
            label: "edit",
            invoke: entry => root.edit(entry)
        }
    })

    function copy(entry): void {
        Quickshell.execDetached(Keybindings.copyArgv(entry.target.combo));
    }

    function edit(entry): void {
        Quickshell.execDetached(Keybindings.editArgv(entry.target.description));
    }

    property bool refreshPending: false

    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Keybindings.listCommand();
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.settleListing(output.text)
        }

        stderr: StdioCollector {}

        onExited: {
            root.settleListing(output.text);
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }

    function settleListing(text): void {
        root.listingText = text;
        root.loaded = true;
    }
}
