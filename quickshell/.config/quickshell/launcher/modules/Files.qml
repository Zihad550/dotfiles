import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/files.js" as Files
import "../lib/directories.js" as Dirs

// The files Provider: find a file inside a matched folder without navigating
// to it first -- type a folder name, get the folders matching it each
// followed by their immediate contents -- ticket 17's port of
// menus/dotfiles_files.lua and menus/dotfiles_file_opener.lua (deleted with
// ticket 19).
//
// **Shares the directories Provider's data source rather than building a
// second index** (checkbox 4). The cache file this lists folders from is
// Dirs.cachePath -- the same ~/.cache/df-dir-picker/folders.list
// Directories.qml reads -- and the background scan that keeps it fresh is
// Directories.qml's own refresh(), which this Provider does not repeat. Two
// FileViews watch one file; the lua it replaces already shared the file the
// same way.
//
// **The only thing read per Query is one directory level of each matching
// folder.** The folders themselves come from the cache synchronously; their
// children come from a single `find` over the top ten of them (the lua's own
// MAX_EXPAND), run asynchronously -- see the finder Process below. That is
// the whole of the design dotfiles_files.lua opens with: an earlier design
// that cached every file under the dev roots measured 1.2s per keystroke at
// 340k files and is gone. Nothing is listed until a folder name is typed,
// and then the cost is one directory read per folder, not one per file.
//
// **Deliberately not in `pool`.** Reached only through "~", elephant's own
// character for it (walker/.config/walker/config.toml:84-87 -- deleted with
// ticket 19) -- walker's own
// config already excluded "menus:dotfilesFiles" from the providers queried by
// default (walker/.config/walker/config.toml:26, deleted with ticket 19), the
// same reason directories
// is kept out. `rankedRoutable` in Launcher.qml is what keeps this Provider
// out of the default pool while still reachable by its prefix.
//
// **The first Provider whose catalog is `ordered`.** The listing's Entries are
// produced in the order they must display -- each folder immediately followed
// by its own contents -- which is a structural claim about order that
// lib/matching.js's score() cannot express: score() ranks every Entry
// independently, so a child that matches the Query well would be pulled out
// from under its parent and interleaved with folders it has nothing to do
// with. Only the listing is ordered; the chooser is an ordinary scored corpus,
// the same as the directories chooser. See the header on lib/files.js for the
// argument, and the note on `scoredEntries` in Launcher.qml for what
// `ordered: true` makes the shell do with it.
QtObject {
    id: root

    readonly property string label: "files"
    readonly property string description: "Find a file inside a folder"
    readonly property string prefix: "~"

    // Whether the Launcher window is open, handed down the same way calc's
    // queryText is -- and for the same reason Directories.qml requires it:
    // going false closes the chooser, so dismissing the Launcher mid
    // "choose app" and reopening it does not land back inside a stale
    // sub-menu.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.openFor = null;
    }

    // The Query, after the "~" is stripped -- handed down by Launcher.qml,
    // which binds it to routed.query when routing names this Provider and to
    // "" otherwise, the same rule calc's own queryText follows. The catalog
    // is a binding over this: every keystroke re-selects the folders, which
    // is how "typing a folder name" narrows the list at all.
    required property string queryText

    // null while showing the listing; `{ path, mirrored }` -- lifted straight
    // off the highlighted Entry's own `target`, see entriesFor in
    // lib/files.js -- while showing the chooser for it. The whole of this
    // Provider's sub-menu state, the same shape Directories.qml's own
    // `openFor` is.
    property var openFor: null
    readonly property bool nested: root.openFor !== null

    readonly property string home: Quickshell.env("HOME")

    // Same prefix, and for the same reasons, as Applications.launchPrefix --
    // see the note there.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    // Directories.qml's cache, not this Provider's own -- see the header.
    readonly property string cachePath: Dirs.cachePath(root.home)

    // Never "not ready". An empty cache before the background scan has
    // finished is the same state checkbox 2 exists for -- "an empty Query
    // lists nothing, deliberately" -- not a fault to report. Same reasoning
    // as the directories Provider's own `ready`.
    readonly property bool ready: true

    // Fed by the FileView below. A plain string rather than the parsed list,
    // so re-parsing only happens in the one binding that needs it -- the
    // same shape Directories.qml's own cacheText is.
    property string cacheText: ""
    readonly property var paths: Dirs.parseCache(root.cacheText)

    // Same trap Directories.qml's own note on `onPathsChanged` names: an
    // empty result and a wrong property name look identical from inside the
    // Launcher, and `ready: true` above means this Provider never says
    // "waiting" to give the difference away on its own. Logged on every
    // count change rather than in a binding, so re-evaluating `catalog`
    // several times a second does not fill the log with lines nothing
    // changed about.
    // The listing is re-asked here as well as on a keystroke, because the
    // Query is not the only thing that decides which folders need reading:
    // this Provider does not own the cache, and Directories.qml's refresh()
    // can land a scan under a Query that was already typed. Without this, a
    // cache arriving late renders folder rows with no contents until the next
    // keystroke.
    onPathsChanged: {
        console.log("launcher: files Provider sees", root.paths.length,
            "path(s) in", root.cachePath);
        root.scheduleListing();
    }

    // The children listing of the *last completed* find, fed by the Process
    // below. A plain string rather than the parsed map, so parsing only
    // happens in the one binding that needs it.
    //
    // **Stale by design, and safe by construction.** A find started for an
    // older Query lands here and replaces whatever was here before. The
    // catalog only ever consults children of folders the *current* Query
    // matches (entriesFor keys its lookup by parent), and those children are
    // still that folder's children -- so a stale listing contributes children
    // that are correct but perhaps incomplete: folders whose contents have
    // not been read since the Query changed list without them until the
    // finder catches up, a gap measured in milliseconds that reads as
    // "contents popping in" rather than as a wrong answer. The alternative --
    // tagging each run with the Query it was for and discarding it
    // otherwise -- would trade this harmless staleness for a list that
    // flickers empty between keystrokes.
    property string childrenText: ""
    readonly property var childrenOf: Files.parseChildren(root.childrenText)

    // Read once, so the Entries and the order they come in are always the
    // ones for the current Query and the current children data -- the same
    // reasoning as every other catalog here. Three shapes behind one property,
    // switched on `openFor` and the Query, and checked in that order:
    //
    // 1. The chooser when something is open -- the small app list, scored from
    //    a corpus exactly the way Directories.qml's own chooser branch is, so
    //    typing narrows the five commands. It carries no keys, so choosing one
    //    records no Frecency; the file itself already did, on the secondary
    //    Action that opened the chooser.
    // 2. Nothing at all for an empty Query -- checkbox 2: "an empty Query
    //    lists nothing, as it does today". Deliberate, not a bug, and it is
    //    this branch, not a rule elsewhere, that makes it true.
    // 3. The matched folders and their contents, in lib/files.js's own order.
    //    This is the only branch that is `ordered`.
    readonly property var catalog: {
        if (root.openFor !== null) {
            const chooser = Files.chooserEntriesFor(root.openFor.path, root.openFor.mirrored, root.launchPrefix, root);
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

    // Which slots this Provider fills depends on whether the chooser is
    // open -- the same shape Directories.qml's own actions take, for the
    // same reason: the *same* Provider filling different slots at different
    // times, rather than a fixed set declared once.
    readonly property var actions: root.openFor !== null
        ? ({
            primary: {
                label: "open",
                invoke: entry => root.openWith(entry)
            },

            // The slot's own default is already "stay" (lib/actions.js) --
            // Directories.qml is the reason that default exists, and this
            // Provider is the second to rely on it -- so nothing here has to
            // override `after`.
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

            // "stay", not the slot's own default of "close": choosing an app
            // is not choosing a file yet, so the Launcher has to still be
            // open for the chooser it is about to show.
            secondary: {
                label: "choose app",
                invoke: entry => root.enterChooser(entry),
                after: "stay"
            }
        })

    function openDefault(entry): void {
        Quickshell.execDetached(Files.defaultOpenArgv(entry.target.path, entry.target.mirrored, root.launchPrefix));
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

    // True between a request that found the finder mid-run and the run that
    // covers what it left behind. See the note on onExited.
    property bool listingPending: false

    // Ask the finder for the current Query's folder contents. Called on every
    // keystroke and on every cache change -- the two things that decide which
    // folders need reading -- and deliberately not awaited by anything: the
    // catalog renders whatever children data already exists and this fills
    // in the rest when the find lands.
    //
    // **At most one process in flight.** A Query typed at speed would
    // otherwise leave several finds racing, and nothing orders their output
    // -- but unlike the calculator's qalc, the stale run is *not* the
    // problem here (see the note on childrenText); the single-process rule
    // is just what keeps a burst of keystrokes from stacking finds. Waiting
    // instead of killing-and-restarting is what makes that ordering a
    // property of the code rather than a hope: the run that finishes calls
    // back in here for whatever the Query has become since.
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

    // Re-asked on a keystroke rather than on a timer or on open. The other
    // trigger is `onPathsChanged` above -- see the note there.
    onQueryTextChanged: root.scheduleListing()

    // Assigned to a property rather than nested bare, the same reason
    // Calculator.qml's own Process is: QtObject has no default property to
    // nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.childrenText = output.text
        }

        // Collected and dropped, the same as the directories Provider's own
        // scan: an empty listing already says plainly that nothing was
        // found, and find's diagnostics on a missing folder are not a fault
        // to log.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and not a duplicate of the
        // collector's own handler -- the same reasoning as Calculator.qml's
        // own `onExited`. Which of onStreamFinished and onExited fires first
        // is not something this file gets to assume, so both settle the same
        // text.
        //
        // Drains `listingPending`: a keystroke that arrived while this run
        // was already in flight gets the fresh run it asked for, once this
        // one is out of the way, rather than being silently dropped. The
        // re-run recomputes the folder list for the *current* Query, which
        // is the whole point -- scheduleListing reads root.queryText at call
        // time, not at the keystroke that set the flag.
        //
        // Deferred rather than called straight from here, because whether
        // `running` has already gone false by the time this handler runs is
        // not something this file gets to assume. Calling in place while it
        // is still true would take scheduleListing's `finder.running` branch,
        // set the flag again, and leave it set for good -- no further exit is
        // coming to drain it. Qt.callLater runs it once the process has
        // actually settled.
        onExited: {
            root.childrenText = output.text;
            if (root.listingPending) {
                root.listingPending = false;
                Qt.callLater(root.scheduleListing);
            }
        }
    }

    // Assigned to a property rather than nested bare, the same reason
    // Directories.qml's own cacheFile is: QtObject has no default property
    // to nest a child into.
    readonly property FileView cacheFile: FileView {
        id: cacheView

        // Directories.qml's cache, watched by two Providers -- see the
        // header. This process is never the only writer (the background scan
        // Directories.qml's refresh() starts is a separate process), so the
        // file has to be watched rather than read once, the same reasoning
        // as Directories.qml's own FileView.
        path: root.cachePath
        watchChanges: true
        onFileChanged: cacheView.reload()
        onLoaded: root.cacheText = cacheView.text()
    }
}
