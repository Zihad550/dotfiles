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
    required property var snapshot
    // RemoteDirectoryIndex's own snapshot -- gated by remoteReady below,
    // unlike `snapshot` above, which is always this machine's own filesystem.
    required property var remoteSnapshot
    onActiveChanged: {
        if (!root.active)
            root.openFor = null;
    }

    // null while showing the directory list; `{ path, mirrored }` for a
    // local Entry, or `{ path, host }` for a remote-provenance one -- both
    // lifted from the Entry's own `target` -- while showing the chooser for it.
    property var openFor: null
    readonly property bool nested: root.openFor !== null
    // `host` (never `mirrored`) is entryFor's own signal for remote provenance.
    function isRemoteTarget(target): bool {
        return target.host !== undefined;
    }
    readonly property bool openForRemote: root.openFor !== null && root.isRemoteTarget(root.openFor)

    readonly property string home: Quickshell.env("HOME")

    readonly property var launchPrefix: ["uwsm-app", "--"]

    // The devcontainer routing toggle (docs/adr/0002): presence of the state
    // file is the signal, not its content -- absent means off, the default.
    readonly property string routingTogglePath: root.home + "/.local/state/dotfiles/toggles/devcontainer-routing"
    property bool routingEnabled: false

    // Single trimmed line; blank or missing falls back to Dirs.SSH_HOST --
    // Dirs.defaultOpenArgv/chooserApps already know that fallback, so "" is
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

    // An empty, stale, or refreshing Directory Index must never block opening.
    readonly property bool ready: true

    readonly property var paths: root.snapshot.paths

    // Gated here rather than by clearing RemoteDirectoryIndex's own
    // snapshot: "off" must hide remote entries immediately even with a
    // cached scan sitting there.
    readonly property bool remoteReady: root.routingEnabled && root.devcontainerHost !== ""
    readonly property var remotePaths: root.remoteReady ? root.remoteSnapshot.paths : []

    // A remote-provenance chooser has no local fallback -- routing turning
    // off from under it must close it too, not just the list behind it
    // (docs/adr/0002's "off means off").
    onRemoteReadyChanged: {
        if (!root.remoteReady && root.openForRemote)
            root.leaveChooser();
    }

    // Logged on count change rather than in a binding, so re-evaluating
    // `catalog` several times a second doesn't fill the log with noise.
    onPathsChanged: console.log("launcher: directories Provider sees", root.paths.length,
        "path(s) at Directory Index revision", root.snapshot.revision)
    onRemotePathsChanged: console.log("launcher: directories Provider sees", root.remotePaths.length,
        "remote path(s) at Directory Index revision", root.remoteReady ? root.remoteSnapshot.revision : 0,
        "for host", root.devcontainerHost)

    // Two shapes behind one property, switched on `openFor`: the ranked
    // directory list when nothing is open, the small unranked chooser when
    // something is. The chooser's corpus carries no keys -- the directory
    // itself already recorded Frecency, on the secondary Action that opened it.
    readonly property var catalog: {
        if (root.openFor !== null) {
            // A remote-provenance entry always routes, to the host it was
            // scanned from -- there's no local path to fall back to.
            const routed = root.openForRemote ? true : root.routedFor(root.openFor.mirrored);
            const host = root.openForRemote ? root.openFor.host : root.devcontainerHost;
            const entries = Dirs.chooserEntriesFor(root.openFor.path, routed, root.home,
                root.launchPrefix, root, host, root.openForRemote);
            return {
                entries: entries,
                corpus: Matching.prepare(entries.map(entry => entry.name), null)
            };
        }

        // Local paths, plus remote ones when routing is on with a custom
        // host set, merged into one pool -- entryFor's own `host` argument
        // keeps a remote key from colliding with a local one of the same
        // relative path.
        //
        // Two corpus texts per directory (leaf, then full relative path), so
        // the corpus carries `owners` -- see lib/directories.js's header for
        // the misranking one text alone produced.
        const items = root.paths.map(path => ({ path: path, host: undefined }))
            .concat(root.remotePaths.map(path => ({ path: path, host: root.devcontainerHost })));
        const built = Catalog.ownedCatalog(items,
            item => Dirs.entryFor(item.path, root.home, root, item.host),
            (item, entry) => Dirs.textsFor(entry.name));
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
        // Same distinction as catalog's chooser branch: a remote-provenance
        // target always routes, to its own host.
        const remote = root.isRemoteTarget(entry.target);
        const routed = remote ? true : root.routedFor(entry.target.mirrored);
        const host = remote ? entry.target.host : root.devcontainerHost;
        Quickshell.execDetached(Dirs.defaultOpenArgv(entry.target.path, routed, root.launchPrefix, host));
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
    // here, and Dirs.sshUrlFor/chooserApps fall back to SSH_HOST for that.
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
