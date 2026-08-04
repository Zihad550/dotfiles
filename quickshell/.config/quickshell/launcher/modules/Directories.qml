import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/directories.js" as Dirs
import "../lib/matching.js" as Matching

// The directories Provider: jump to any project directory by fuzzy-matching
// its path. Asynchronous, cached, background-refreshed, and the first
// Provider with a Chooser of its own -- ticket 12's "half the abstraction
// stress-test".
//
// The Provider interface it fills -- label, ready, catalog, actions -- is
// documented at the top of Applications.qml. Two additions this ticket makes
// to it:
//
// **`prefix`, but deliberately kept out of `pool`.** Every other Provider with
// a catalog is scored on every keystroke of every Query; this one is reachable
// only through "/", elephant's own character
// (walker/.config/walker/config.toml:76-78 -- deleted with ticket 19). Not a
// stopgap -- walker's own
// config already excluded "menus:dotfilesDirs" from the providers queried by
// default (walker/.config/walker/config.toml:20, deleted with ticket 19), for
// the reason the spec's
// own benchmark gives: ~17,000 paths cost 46-61ms to score per keystroke, and
// paying that for every Query typed would slow down applications and windows
// for a feature nothing asked to have on by default. `rankedRoutable` in
// Launcher.qml is what keeps this Provider out of the default pool while still
// reachable by its prefix.
//
// **`nested`, optional on the interface.** True while this Provider is showing
// the chooser rather than the directory list. Launcher.qml gives a nested
// Provider the whole pool to itself -- the same way a routed prefix does --
// and clears the Query crossing either edge of it. See the note on
// `nestedProvider` there for why a second Provider wanting a Chooser of its
// own would not need Launcher.qml to change to get one.
QtObject {
    id: root

    readonly property string label: "directories"
    readonly property string description: "Jump to a directory"
    readonly property string prefix: "/"

    // Whether the Launcher window is open, handed down the same way calc's
    // queryText is. Required rather than read off Quickshell.PanelWindow
    // directly, so a Provider bound to nothing fails loudly instead of
    // silently never closing its own chooser.
    //
    // Going false closes the chooser: without this, dismissing the Launcher
    // mid "choose app" and reopening it would land back inside a stale Chooser --
    // the same class of failure the spec's problem statement opens with, a
    // selection leaking into the next session, one Provider early.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.openFor = null;
    }

    // null while showing the directory list; `{ path, mirrored }` -- lifted
    // straight off the Entry's own `target`, see entryFor in
    // lib/directories.js -- while showing the chooser for it. The whole of
    // this Provider's Chooser state.
    property var openFor: null
    readonly property bool nested: root.openFor !== null

    readonly property string home: Quickshell.env("HOME")

    // Same prefix, and for the same reasons, as Applications.launchPrefix --
    // see the note there.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    readonly property string cachePath: Dirs.cachePath(root.home)

    // Never "not ready". An empty cache before the first background scan has
    // finished is the state checkbox 3 exists for -- "a stale or
    // still-building cache never blocks opening" -- not a fault to report.
    // Same reasoning as the windows Provider's own `ready`.
    readonly property bool ready: true

    // Fed by the FileView below. A plain string rather than the parsed list,
    // so re-parsing only happens in the one binding that needs it.
    property string cacheText: ""
    readonly property var paths: Dirs.parseCache(root.cacheText)

    // Same trap the windows Provider's own report() names: an empty result
    // and a wrong property name look identical from inside the Launcher, and
    // `ready: true` above means this Provider never says "waiting" to give
    // the difference away on its own. Logged on every count change rather
    // than in a binding, so a Query re-evaluating `catalog` several times a
    // second does not fill the log with lines nothing changed about.
    onPathsChanged: console.log("launcher: directories Provider sees", root.paths.length,
        "path(s) in", root.cachePath)

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from -- the same reasoning as every other catalog here.
    //
    // Two shapes behind one property, switched on `openFor`: the ranked
    // directory list when nothing is open, and the small, unranked chooser
    // when something is. The chooser's corpus carries no keys -- Dirs.
    // chooserEntriesFor gives its Entries none -- so choosing one records no
    // Frecency; the directory itself already did, on the secondary Action
    // that opened the chooser (Actions.counts() does not exclude it).
    readonly property var catalog: {
        if (root.openFor !== null) {
            const entries = Dirs.chooserEntriesFor(root.openFor.path, root.openFor.mirrored, root.home, root.launchPrefix, root);
            return {
                entries: entries,
                corpus: Matching.prepare(entries.map(entry => entry.name), null)
            };
        }

        // Two corpus texts per directory -- its leaf, then its full relative
        // path -- so the corpus carries `owners`, the same arrangement the
        // windows and menu Providers use. See the header on
        // lib/directories.js for the misranking that made one text not
        // enough.
        const built = Catalog.ownedCatalog(root.paths,
            path => Dirs.entryFor(path, root.home, root),
            (path, entry) => Dirs.textsFor(entry.name));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Which slots this Provider fills depends on whether the chooser is open,
    // which is the one thing about this Provider ticket 06's vocabulary had
    // not been asked to do yet: the *same* Provider filling different slots
    // at different times, rather than a fixed set declared once.
    readonly property var actions: root.openFor !== null
        ? ({
            primary: {
                label: "open",
                invoke: entry => root.openWith(entry)
            },

            // The slot's own default is already "stay" (lib/actions.js) --
            // this Provider is the reason that default exists -- so nothing
            // here has to override `after`.
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
            // is not choosing a directory yet, so the Launcher has to still
            // be open for the chooser it is about to show.
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

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Cheap to call even when there is nothing to do -- the guard
    // inside refreshScript is a `test` and a `stat`, not a scan -- so
    // Launcher.qml calls this on every open, the same as the windows
    // Provider's own refresh, plus once here at startup. Fire-and-forget:
    // nothing waits on it, and the FileView below picks up whatever it
    // produces once the file changes under it.
    function refresh(): void {
        Quickshell.execDetached(Dirs.refreshCommand(root.home));
    }

    Component.onCompleted: root.refresh()

    // Assigned to a property rather than nested bare, the same reason
    // Calculator.qml's own Process is: QtObject has no default property to
    // nest a child into, unlike Frecency.qml's Singleton, which does.
    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath

        // Unlike Frecency.qml's store, this process is never the only writer
        // -- the background scan refresh() starts is a separate process --
        // so the file has to be watched rather than read once.
        watchChanges: true
        onFileChanged: cacheView.reload()
        onLoaded: root.cacheText = cacheView.text()

        // Unverified from here: whether a FileView watching a path that does
        // not exist yet notices the path being *created* -- the cache (the
        // path df-dir-picker's own script used to write, name inherited) lives
        // under ~/.cache and a machine that has never run
        // this Launcher has no file there for refresh()'s first build to
        // land on top of. If a fresh machine never lists a single directory
        // despite refresh() having run, this is the API to re-check; reading
        // ~/.cache/df-dir-picker/folders.list by hand tells the two failures
        // apart.
    }
}
