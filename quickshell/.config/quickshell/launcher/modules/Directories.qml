import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/directories.js" as Dirs
import "../lib/matching.js" as Matching

// The directories Provider: jump to any project directory by fuzzy-matching
// its path. Asynchronous, cached, background-refreshed, and the first
// Provider with a Chooser of its own. Provider interface: see docs/launcher-spec.md.
//
// Deliberately kept out of `pool`, reachable only through "/": scoring
// ~17,000 paths costs 46-61ms per keystroke, which every other Query typed
// shouldn't have to pay. `rankedRoutable` in Launcher.qml keeps it out of the
// default pool while still prefix-reachable.
//
// `nested` is true while showing the chooser rather than the directory list.
// Launcher.qml gives a nested Provider the whole pool to itself, the same way
// a routed prefix does, and clears the Query crossing either edge of it.
QtObject {
    id: root

    readonly property string label: "directories"
    readonly property string description: "Jump to a directory"
    readonly property string prefix: "/"

    // Required so a Provider bound to nothing fails loudly instead of
    // silently never closing its own chooser. Going false closes it, so
    // dismissing mid "choose app" and reopening never lands back in a stale Chooser.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.openFor = null;
    }

    // null while showing the directory list; `{ path, mirrored }` (lifted
    // from the Entry's own `target`) while showing the chooser for it.
    property var openFor: null
    readonly property bool nested: root.openFor !== null

    readonly property string home: Quickshell.env("HOME")

    readonly property var launchPrefix: ["uwsm-app", "--"]

    readonly property string cachePath: Dirs.cachePath(root.home)

    // Never "not ready": an empty cache before the first background scan
    // finishes is expected, not a fault -- a stale or still-building cache
    // must never block opening.
    readonly property bool ready: true

    // A plain string, not the parsed list, so re-parsing happens only where needed.
    property string cacheText: ""
    readonly property var paths: Dirs.parseCache(root.cacheText)

    // Logged on count change rather than in a binding, so re-evaluating
    // `catalog` several times a second doesn't fill the log with noise.
    onPathsChanged: console.log("launcher: directories Provider sees", root.paths.length,
        "path(s) in", root.cachePath)

    // Two shapes behind one property, switched on `openFor`: the ranked
    // directory list when nothing is open, the small unranked chooser when
    // something is. The chooser's corpus carries no keys -- the directory
    // itself already recorded Frecency, on the secondary Action that opened it.
    readonly property var catalog: {
        if (root.openFor !== null) {
            const entries = Dirs.chooserEntriesFor(root.openFor.path, root.openFor.mirrored, root.home, root.launchPrefix, root);
            return {
                entries: entries,
                corpus: Matching.prepare(entries.map(entry => entry.name), null)
            };
        }

        // Two corpus texts per directory (leaf, then full relative path), so
        // the corpus carries `owners` -- see lib/directories.js's header for
        // the misranking one text alone produced.
        const built = Catalog.ownedCatalog(root.paths,
            path => Dirs.entryFor(path, root.home, root),
            (path, entry) => Dirs.textsFor(entry.name));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Which slots fill depends on whether the chooser is open -- the same
    // Provider filling different slots at different times.
    readonly property var actions: root.openFor !== null
        ? ({
            primary: {
                label: "open",
                invoke: entry => root.openWith(entry)
            },

            back: {
                label: "back",
                invoke: () => root.leaveChooser()
            }
        })
        : ({
            primary: {
                label: "open in editor",
                invoke: entry => root.openDefault(entry)
            },

            // "stay", not the slot's default "close": choosing an app isn't
            // choosing a directory yet.
            secondary: {
                label: "choose app",
                invoke: entry => root.enterChooser(entry),
                after: "stay"
            }
        })

    function openDefault(entry): void {
        Quickshell.execDetached(Dirs.defaultOpenArgv(entry.target.path, entry.target.mirrored, root.launchPrefix));
    }

    function enterChooser(entry): void {
        root.openFor = entry.target;
    }

    function leaveChooser(): void {
        root.openFor = null;
    }

    function openWith(entry): void {
        Quickshell.execDetached(entry.target.argv);
    }

    // Cheap even when there's nothing to do (a `test` and a `stat`, not a
    // scan), so Launcher.qml calls this on every open. Fire-and-forget: the
    // FileView below picks up whatever it produces once the file changes.
    function refresh(): void {
        Quickshell.execDetached(Dirs.refreshCommand(root.home));
    }

    Component.onCompleted: root.refresh()

    // QtObject has no default property to nest a child into.
    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath

        // Watched, not read once: this process is never the only writer
        // (refresh() starts a separate background scan).
        watchChanges: true
        onFileChanged: cacheView.reload()
        onLoaded: root.cacheText = cacheView.text()

        // Unverified: whether a FileView watching a not-yet-existing path
        // notices it being created. If a fresh machine never lists a
        // directory despite refresh() having run, this is the API to
        // re-check -- reading ~/.cache/df-dir-picker/folders.list by hand
        // tells the two failures apart.
    }
}
