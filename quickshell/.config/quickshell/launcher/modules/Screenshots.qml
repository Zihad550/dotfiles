import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/screenshots.js" as Shots

// The screenshots Provider: pick a screenshot from a list of names and dates
// with a live preview of whichever is highlighted, mark several, act on all
// at once. Provider interface: see docs/launcher-spec.md ("layout: preview"
// and the `mark` slot).
//
// A narrow list on the left, a single large preview of the highlighted Entry
// on the right (a thumbnail grid turned out to pick blind -- see the header
// on the preview split in Launcher.qml). Nothing about the Provider side
// depends on that layout choice: catalog, Actions and marking below would
// work the same under a grid.
//
// Reached only through its own prefix, out of `pool`: a two-column layout
// mixed into a one-line-per-Entry ranked list wouldn't be legible either way.
// `previewMode` in Launcher.qml only renders it when this Provider owns the
// whole pool, which prefix routing guarantees.
//
// Marking is owned here, not by the shell: lib/actions.js declares the
// `mark` slot and its Tab chord, but has nowhere to keep "which Entries are
// marked" that wouldn't leak between Providers, so the selection lives on
// this Provider (mirroring Directories.qml's `openFor`). `active`, bound to
// Launcher.qml's `root.visible`, clears it the moment the Launcher closes so
// a mark never reaches a later session.
//
// `marked` is reassigned wholesale on every toggle, not mutated in place: a
// QML `property var` only notifies on assignment.
QtObject {
    id: root

    readonly property string label: "screenshots"
    readonly property string description: "Recent screenshots"
    readonly property string prefix: "#"
    readonly property string layout: "preview"

    readonly property string home: Quickshell.env("HOME")
    readonly property string dir: Shots.screenshotsDir(root.home)

    // Required so a Provider bound to nothing fails loudly instead of
    // silently carrying marks into a future session.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.marked = ({});
    }

    // Keyed by absolute path. Empty means "nothing marked", which the
    // secondary Action treats as meaningfully different from an explicit
    // empty set -- see copyPaths.
    property var marked: ({})

    function toggleMark(entry) {
        const path = entry.target.path;
        const next = Object.assign({}, root.marked);
        if (next[path])
            delete next[path];
        else
            next[path] = true;
        root.marked = next;
    }

    // Never "not ready": an empty ~/Pictures/Screenshots is legitimate (no
    // screenshot taken yet), not a fault.
    readonly property bool ready: true

    // A plain string, not the parsed list, so re-parsing happens only where needed.
    property string listingText: ""
    readonly property var items: Shots.parseListing(root.listingText)

    property string loggedState: ""
    onItemsChanged: {
        const state = String(root.items.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: screenshots Provider sees", root.items.length, "screenshot(s) in", root.dir);
    }

    // Depends on `root.marked` as well as `root.items`: the preview list
    // delegate reads `target.marked` off the Entry, and a catalog that
    // ignored the selection would go on showing a stale tick.
    readonly property var catalog: {
        const built = Shots.catalogOf(root.items, root.marked, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null)
        };
    }

    // copy the image, copy the path(s), toggle the mark. No `back` -- no sub-view to leave.
    readonly property var actions: ({
        primary: {
            label: "copy image",
            invoke: entry => root.copyImage(entry)
        },

        secondary: {
            label: "copy path",
            invoke: entry => root.copyPaths(entry)
        },

        mark: {
            label: "mark",
            invoke: entry => root.toggleMark(entry)
        }
    })

    function copyImage(entry): void {
        Quickshell.execDetached(Shots.copyImageArgv(entry.target.path));

        // Copying ends the selection -- otherwise a mark from before a plain
        // Return would still be marked next time this Provider is reached in
        // the same session.
        root.marked = ({});
    }

    // Every marked path, or just the highlighted one when nothing is marked.
    function copyPaths(entry): void {
        const paths = Object.keys(root.marked);
        Quickshell.execDetached(Shots.copyPathsArgv(paths.length > 0 ? paths : [entry.target.path]));
        root.marked = ({});
    }

    // Called at startup and on every open, so a screenshot taken since the
    // Launcher last opened shows up.
    function refresh(): void {
        if (finder.running)
            return;
        finder.command = Shots.listCommand(root.home);
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

        // Collected and dropped: `find` writes a diagnostic per unreadable
        // entry, which an empty list already covers without a log line per refresh.
        stderr: StdioCollector {}

        // Not a duplicate of onStreamFinished: which fires first isn't
        // guaranteed, and a process exiting before its stream drains would
        // otherwise leave `listingText` stale.
        onExited: root.listingText = output.text
    }
}
