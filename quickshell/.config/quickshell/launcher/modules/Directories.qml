import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "../lib/catalog.js" as Catalog
import "../lib/directorylaunch.js" as DirectoryLaunch
import "../lib/directories.js" as Dirs
import "../lib/matching.js" as Matching
import "../lib/sequence.js" as Seq
import "../lib/workspaces.js" as Ws

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

    // null while showing the directory list; `{ path }` for a local Entry,
    // or `{ path, host }` for a remote-provenance one -- both lifted from
    // the Entry's own `target` -- while showing the chooser for it.
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

    // An empty, stale, or refreshing Directory Index must never block opening.
    readonly property bool ready: true

    readonly property var paths: root.snapshot.paths

    // Gated here rather than by clearing RemoteDirectoryIndex's own
    // snapshot: "off" must hide remote entries immediately even with a
    // cached scan sitting there.
    readonly property bool remoteReady: root.routingEnabled && root.devcontainerHost !== ""
    readonly property var remotePaths: root.remoteReady ? root.remoteSnapshot.paths : []

    // A launch outlives the Launcher surface: the primary Action dismisses it
    // before the application is requested, but the compositor may take a few
    // frames to report the resulting focused window.
    property var pendingLaunches: []

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
            // scanned from -- there's no local path to fall back to. A
            // local entry never does (#92, docs/adr/0010): routing follows
            // provenance now, not the toggle. `root.routingEnabled` still
            // reaches the chooser -- only the Herdr row reads it, to mark
            // itself as the one row that can still route.
            const routed = root.openForRemote;
            const host = root.openForRemote ? root.openFor.host : root.devcontainerHost;
            const entries = Dirs.chooserEntriesFor(root.openFor.path, routed, root.home,
                root.launchPrefix, root, host, root.openForRemote, root.routingEnabled);
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
        // target always routes, to its own host; a local one never does (#92).
        const remote = root.isRemoteTarget(entry.target);
        const host = remote ? entry.target.host : root.devcontainerHost;
        root.openDirectory({
            path: entry.target.path,
            application: "zed",
            argv: Dirs.defaultOpenArgv(entry.target.path, remote, root.launchPrefix, host)
        });
    }

    function enterChooser(entry): void {
        root.openFor = entry.target;
    }

    function leaveChooser(): void {
        root.openFor = null;
    }

    function openWith(entry): void {
        root.openDirectory(entry.target);
    }

    function stringOf(value) {
        return typeof value === "string" ? value : "";
    }

    // Snapshot only the identity and focus facts the pure coordinator needs.
    // `lastIpcObject` is the fallback for the short interval before the
    // Wayland handle or Hyprland workspace object is linked.
    function compositorSnapshot() {
        const active = Hyprland.activeToplevel;
        const activeAddress = root.stringOf(active?.address);
        return Seq.listOf(Hyprland.toplevels?.values).map(toplevel => {
            const workspace = toplevel.workspace;
            const ipcWorkspace = toplevel.lastIpcObject?.workspace;
            const address = root.stringOf(toplevel.address);
            const wayland = toplevel.wayland;
            const appId = root.stringOf(wayland?.appId || toplevel.lastIpcObject?.class);
            const focused = toplevel === active || wayland === active
                || (address !== "" && address === activeAddress)
                || toplevel.activated === true
                || wayland?.activated === true;

            return {
                address: address,
                appId: appId,
                workspaceId: workspace?.id ?? ipcWorkspace?.id ?? null,
                workspaceName: root.stringOf(workspace?.name || ipcWorkspace?.name),
                focused: focused
            };
        }).filter(window => window.address !== "");
    }

    // Start tracking before dispatching so a very fast application cannot
    // focus a window between the open request and the first poll. A failed or
    // slow optional rename must never turn a successful directory open into
    // an apparent failure.
    function openDirectory(request): void {
        const before = root.compositorSnapshot();
        root.pendingLaunches = root.pendingLaunches.concat([DirectoryLaunch.begin(before, request)]);

        if (!root.launchPollTimer.running)
            root.launchPollTimer.start();

        Quickshell.execDetached(request.argv);
    }

    function pollDirectoryLaunch(): void {
        if (root.pendingLaunches.length === 0)
            return;

        if (typeof Hyprland.refreshToplevels === "function")
            Hyprland.refreshToplevels();
        if (typeof Hyprland.refreshWorkspaces === "function")
            Hyprland.refreshWorkspaces();

        const snapshot = root.compositorSnapshot();
        const remaining = [];
        const claimed = {};

        for (const pending of root.pendingLaunches) {
            const polled = DirectoryLaunch.poll(pending, snapshot, claimed);
            if (!polled.done) {
                remaining.push(polled.state);
                continue;
            }

            if (polled.destination === null) {
                console.warn("launcher: directory opened without a confident focused-window match for",
                    pending.request.application);
                continue;
            }

            claimed[polled.destination.identity] = true;
            const name = DirectoryLaunch.workspaceNameFor(polled.destination.workspaceId,
                pending.request.application, DirectoryLaunch.directoryHintOf(pending.request.path));
            Quickshell.execDetached(Ws.renameLuaArgv(polled.destination.workspaceId, name));
        }

        root.pendingLaunches = remaining;
        if (remaining.length === 0)
            root.launchPollTimer.stop();
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

    readonly property Timer launchPollTimer: Timer {
        interval: DirectoryLaunch.POLL_INTERVAL_MS
        repeat: true
        onTriggered: root.pollDirectoryLaunch()
    }

}
