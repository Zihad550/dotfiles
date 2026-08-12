import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/keybindings.js" as Keybindings

// The keybindings Provider: every live Hyprland bind, reachable through `!`.
// It reads the compositor's state rather than parsing bindings/*.lua, so a
// reload or a runtime-generated bind is reflected on the next open. The
// source files are consulted only when the edit Action is invoked; see
// docs/adr/0006-keybindings-provider-live-source.md.
QtObject {
    id: root

    readonly property string label: "keybindings"
    readonly property string description: "Search Hyprland keybindings"
    readonly property string prefix: "!"
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")
    readonly property string bindingsDir: root.home + "/dotfiles/hypr/.config/hypr/lua/bindings"

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
        if (sourceFinder.running)
            return;

        root.editingDescription = entry.target.description;
        sourceFinder.command = Keybindings.findSourceCommand(
            entry.target.description, root.bindingsDir);
        sourceFinder.running = true;
    }

    readonly property Process sourceFinder: Process {
        id: sourceFinder

        stdout: StdioCollector {
            id: sourceOutput
        }

        stderr: StdioCollector {
            id: sourceError
        }

        onExited: {
            const match = Keybindings.sourceMatchOf(sourceOutput.text);
            if (match !== null) {
                Quickshell.execDetached(Keybindings.openArgv(match));
            } else {
                console.warn("launcher: keybindings Provider could not find source for",
                    root.editingDescription, sourceError.text);
            }
            root.editingDescription = "";
        }
    }

    // Retained only for the diagnostic after the Launcher has dismissed and
    // the original Entry is no longer part of the active view.
    property string editingDescription: ""

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
