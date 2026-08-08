import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/clipboard.js" as Clip

// The clipboard Provider: clipboard history, most recent first, reachable
// through its own prefix. Structurally this is Screenshots.qml with the
// layout dropped: a Process feeding a listing string, a pure module turning
// that into Entries, one Action. No `mark`, `nested`, or `layout` -- those
// interface slots stay unfilled on purpose. Provider interface: see docs/launcher-spec.md.
//
// Kept out of `pool`, same reason as directories: it has a real `catalog`
// (unlike calc/websearch), and scoring the whole clipboard history against
// every keystroke of every other Query would cost time nothing else should pay.
//
// No Entry Key: a clipboard entry's content isn't the same act chosen
// twice -- pasting an email address five times is five choices of the same
// row, not four repeats of one. A key would let a re-copied entry climb
// above ones copied since it, silently turning "most recent first" into
// "most used first". Same conclusion as Screenshots.qml, same reason:
// recency and Frecency answer different questions.
QtObject {
    id: root

    readonly property string label: "clipboard"
    readonly property string description: "Clipboard history"
    readonly property string prefix: "$"

    // Never "not ready": an empty history is legitimate, not a fault.
    readonly property bool ready: true

    // A plain string, not the parsed list, so re-parsing happens only where needed.
    property string listingText: ""
    readonly property var items: Clip.parseListing(root.listingText)

    property string loggedState: ""
    onItemsChanged: {
        const state = String(root.items.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: clipboard Provider sees", root.items.length, "entries in history");
    }

    // No `keys` (see the header above), no `owners`: one corpus text per Entry.
    readonly property var catalog: {
        const built = Clip.catalogOf(root.items, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null)
        };
    }

    // Copying an Entry back is primary; `clear history` and `delete entry`
    // are extras. Elephant's provider also offered pin and edit -- not
    // ported, since nothing asks for them.
    readonly property var actions: ({
        primary: {
            label: "copy",
            invoke: entry => root.copy(entry)
        },

        // Provider-scoped, not per-Entry, but `extras` only dispatches
        // against the highlighted Entry, so this is reachable exactly when
        // the list has something to clear.
        extras: [
            {
                chord: "Ctrl+X",
                label: "clear history",
                invoke: () => root.clearHistory(),
                after: "stay"
            },
            {
                // Not Ctrl+D: Qt text fields bind that natively to "delete
                // character forward", and the query field claims it before
                // this chord sees the key.
                chord: "Alt+D",
                label: "delete entry",
                invoke: entry => root.deleteEntry(entry),
                after: "stay"
            }
        ]
    })

    function copy(entry): void {
        const argv = entry.target.isImage
            ? Clip.copyImageArgv(entry.target.raw)
            : Clip.copyArgv(entry.target.raw);
        Quickshell.execDetached(argv);
    }

    // Runs `cliphist wipe` to completion before refreshing: execDetached
    // would return before the wipe finishes, and a refresh fired right after
    // could still read the old history back.
    function clearHistory(): void {
        if (wiper.running)
            return;
        wiper.running = true;
    }

    readonly property Process wiper: Process {
        id: wiper
        command: Clip.clearCommand()
        onExited: root.refresh()
    }

    // Run through a Process, not execDetached, for the same reason as the
    // wiper: refresh must wait for the delete to actually land.
    function deleteEntry(entry): void {
        if (remover.running)
            return;
        remover.command = Clip.deleteArgv(entry.target.raw);
        remover.running = true;
    }

    readonly property Process remover: Process {
        id: remover
        onExited: root.refresh()
    }

    // Queued, not dropped: `wiper`/`remover` both call refresh() from their
    // own onExited, and one landing while `finder` is already running must
    // still be honoured once it settles.
    property bool refreshPending: false

    // Called at startup and on every open, so something copied since the
    // Launcher last opened is first in the list.
    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Clip.listCommand();
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

        // Not a duplicate of onStreamFinished: which fires first isn't
        // guaranteed, so both settle the same text. Drains `refreshPending`.
        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
