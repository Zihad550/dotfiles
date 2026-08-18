import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/files.js" as Files

// The files Provider: find a file inside a matched folder without navigating
// to it first -- type a folder name, get the folders matching it each
// followed by their immediate contents.
//
// Consumes the same versioned Directory Index snapshot as the directories
// Provider. It owns neither persisted index loading nor index scans.
//
// The only thing read per Query is one directory level of each matching
// folder: folders come from the cache synchronously, children come from a
// single `find` over the top ten matches, run asynchronously (see the finder
// Process below). An earlier design that cached every file under the dev
// roots measured 1.2s per keystroke at 340k files.
//
// Deliberately not in `pool`: reached only through "~". `rankedRoutable` in
// Launcher.qml keeps it out of the default pool while still prefix-reachable.
//
// The first Provider whose catalog is `ordered`: the listing's Entries are
// produced in required display order (each folder immediately followed by
// its own contents), which independent per-Entry scoring would break apart.
// Only the listing is ordered -- the chooser is an ordinary scored corpus,
// same as the directories chooser. See lib/files.js and `scoredEntries` in
// Launcher.qml.
QtObject {
    id: root

    readonly property string label: "files"
    readonly property string description: "Find a file inside a folder"
    readonly property string prefix: "~"

    // Closes the chooser when the Launcher is dismissed, so reopening never
    // lands back inside a stale sub-menu.
    required property bool active
    required property var snapshot
    onActiveChanged: {
        if (!root.active)
            root.openFor = null;
    }

    // The Query with "~" stripped, or "" when routed elsewhere. The catalog
    // binds on this, so every keystroke re-selects the folders.
    required property string queryText

    // null while showing the listing; `{ path, mirrored }` (lifted from the
    // highlighted Entry's own `target`) while showing the chooser for it --
    // the same shape as Directories.qml's own `openFor`.
    property var openFor: null
    readonly property bool nested: root.openFor !== null

    readonly property string home: Quickshell.env("HOME")

    readonly property var launchPrefix: ["uwsm-app", "--"]

    // The devcontainer routing toggle (docs/adr/0002): presence of the state
    // file is the signal, not its content -- absent means off, the default.
    // Read independently of Directories.qml's own copy -- see the header on
    // why this module duplicates rather than imports.
    readonly property string routingTogglePath: root.home + "/.local/state/dotfiles/toggles/devcontainer-routing"
    property bool routingEnabled: false

    // Single trimmed line; blank or missing falls back to Files.SSH_HOST --
    // Files.defaultOpenArgv/chooserApps already know that fallback, so "" is
    // handed down unresolved.
    readonly property string hostFilePath: root.home + "/.local/state/dotfiles/devcontainer-host"
    property string devcontainerHost: ""

    // Collapses isMirrored's structural answer with the toggle -- the
    // override, not layered on top, this ticket exists for. Every call site
    // below routes through this rather than reading `routingEnabled` itself,
    // so there is exactly one place that combines them.
    function routedFor(mirrored): bool {
        return mirrored && root.routingEnabled;
    }

    // Never "not ready": an empty cache before the background scan finishes
    // is the same "empty Query lists nothing" state, not a fault.
    readonly property bool ready: true

    readonly property var paths: root.snapshot.paths

    // Re-asked here as well as on a keystroke: a new shared snapshot can land
    // under a Query already typed. Without this, late-arriving paths render
    // folder rows with no contents until the next keystroke.
    onPathsChanged: {
        console.log("launcher: files Provider sees", root.paths.length,
            "path(s) at Directory Index revision", root.snapshot.revision);
        root.scheduleListing();
    }

    // The children listing of the *last completed* find. A plain string, not
    // the parsed map, so parsing happens only where needed.
    //
    // Stale by design, safe by construction: a find started for an older
    // Query lands here and replaces whatever was there, but the catalog only
    // ever consults children of folders the *current* Query matches, and
    // those children are still correct for that folder -- just possibly
    // incomplete until the finder catches up (reads as "contents popping in"
    // over a few milliseconds, not a wrong answer).
    property string childrenText: ""
    readonly property var childrenOf: Files.parseChildren(root.childrenText)

    // Three shapes behind one property, switched on `openFor` and the Query:
    // 1. The chooser when something is open (no keys -- the file itself
    //    already recorded Frecency, on the secondary Action that opened it).
    // 2. Nothing for an empty Query -- deliberate, not a bug.
    // 3. Matched folders and their contents, in lib/files.js's own order
    //    (the only branch that's `ordered`).
    readonly property var catalog: {
        if (root.openFor !== null) {
            const routed = root.routedFor(root.openFor.mirrored);
            const chooser = Files.chooserEntriesFor(root.openFor.path, routed, root.launchPrefix, root, root.devcontainerHost);
            return {
                entries: chooser,
                corpus: Matching.prepare(chooser.map(entry => entry.name), null)
            };
        }

        if (root.queryText === "")
            return { entries: [], ordered: true };

        return {
            entries: Files.entriesFor(root.paths, root.home, root.queryText, root.childrenOf, root),
            ordered: true
        };
    }

    // Which slots fill depends on whether the chooser is open -- same shape
    // as Directories.qml's own actions, for the same reason: one Provider
    // filling different slots at different times.
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
            // choosing a file yet.
            secondary: {
                label: "choose app",
                invoke: entry => root.enterChooser(entry),
                after: "stay"
            }
        })

    function openDefault(entry): void {
        const routed = root.routedFor(entry.target.mirrored);
        Quickshell.execDetached(Files.defaultOpenArgv(entry.target.path, routed, root.launchPrefix, root.devcontainerHost));
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

    // True between a request that found the finder mid-run and the run that covers it.
    property bool listingPending: false

    // Called on every keystroke and every cache change. Not awaited: the
    // catalog renders whatever children data already exists and this fills
    // in the rest when the find lands.
    //
    // At most one process in flight -- unlike the calculator's qalc, a stale
    // run here isn't wrong (see childrenText above), so this just stops a
    // burst of keystrokes stacking finds. The run that finishes re-triggers
    // scheduleListing for whatever the Query has become since.
    function scheduleListing(): void {
        if (root.queryText === "")
            return;

        const dirs = Files.expandPaths(root.paths, root.home, root.queryText);
        if (dirs.length === 0)
            return;

        if (finder.running) {
            root.listingPending = true;
            return;
        }

        finder.command = Files.childrenCommand(dirs);
        finder.running = true;
    }

    onQueryTextChanged: root.scheduleListing()

    // QtObject has no default property to nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.childrenText = output.text
        }

        // Collected and dropped: an empty listing already says plainly that
        // nothing was found.
        stderr: StdioCollector {}

        // Not a duplicate of onStreamFinished: which fires first isn't
        // guaranteed, so both settle the same text.
        //
        // Drains `listingPending`: a keystroke that arrived mid-run gets a
        // fresh run once this one clears, recomputed for the *current* Query.
        //
        // Deferred via Qt.callLater rather than called in place, since
        // `running` may not have gone false yet when this handler runs --
        // calling scheduleListing() in place could re-set the flag with no
        // further exit left to drain it.
        onExited: {
            root.childrenText = output.text;
            if (root.listingPending) {
                root.listingPending = false;
                Qt.callLater(root.scheduleListing);
            }
        }
    }

    // Existence-only: routing is off, the default, until this file appears.
    // printErrors: false because absence is the common case (default off),
    // not a fault worth logging.
    readonly property FileView routingToggleFile: FileView {
        id: routingToggleView

        path: root.routingTogglePath
        watchChanges: true
        printErrors: false
        onFileChanged: routingToggleView.reload()
        onLoaded: root.routingEnabled = true
        onLoadFailed: root.routingEnabled = false
    }

    // Single trimmed line; missing, unreadable, or blank all resolve to ""
    // here, and Files.sshUrlFor/chooserApps fall back to SSH_HOST for that.
    readonly property FileView hostFile: FileView {
        id: hostView

        path: root.hostFilePath
        watchChanges: true
        printErrors: false
        onFileChanged: hostView.reload()
        onLoaded: root.devcontainerHost = hostView.text().trim()
        onLoadFailed: root.devcontainerHost = ""
    }
}
