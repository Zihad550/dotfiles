import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/directoryindex.js" as Index

// DirectoryIndex.qml's remote counterpart, scoped to the Devcontainer
// Routing custom host instead of this machine's filesystem. See
// docs/adr/0002-devcontainer-routing-toggle.md and this file's own scanner/
// cacheFile for why it can't just be that file parameterized by host.
QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")

    // Existence-only, same contract as Directories.qml's own copy.
    readonly property string routingTogglePath: root.home + "/.local/state/dotfiles/toggles/devcontainer-routing"
    property bool routingEnabled: false

    // Single trimmed line; missing, unreadable, or blank all resolve to "" --
    // "no custom host set", which never scans.
    readonly property string hostFilePath: root.home + "/.local/state/dotfiles/devcontainer-host"
    property string host: ""

    // Both gate every SSH call this component makes -- see docs/adr/0002.
    readonly property bool enabled: root.routingEnabled && root.host !== ""

    property var _snapshot: ({ paths: [], revision: 0 })
    readonly property var snapshot: root._snapshot

    property var _schedule: Index.idleSchedule()
    property bool _initialized: false
    property bool _accessPending: false
    // The host a scan in flight was started against -- checked on completion
    // so a result for a host nobody's watching any more (changed mid-scan)
    // is discarded instead of publishing under the wrong name.
    property string _scanningHost: ""

    readonly property string cachePath: root.host === "" ? "" : Index.remoteIndexPath(root.home, root.host)

    function access(): void {
        if (!root.enabled)
            return;

        if (!root._initialized) {
            root._accessPending = true;
            return;
        }

        const requested = Index.requestScan(root._schedule);
        root._schedule = requested.schedule;
        if (requested.scan)
            root.startScan();
    }

    function initialize(text): void {
        if (root._initialized)
            return;
        root._initialized = true;

        const started = Index.loadSnapshot(text, root.home, root._accessPending);
        root._snapshot = started.snapshot;
        if (started.error !== "")
            console.warn("launcher: remote Directory Index (" + root.host + ") ignored cached data:", started.error);

        root._accessPending = false;
        if (started.scan)
            root.access();
    }

    function startScan(): void {
        // A scan already in flight owns `_schedule.running` -- bail without
        // touching it so that invariant stays true, rather than stomping a
        // real Process with a second command while it's still running.
        if (scanner.running)
            return;
        if (!root.enabled) {
            root._schedule = Index.idleSchedule();
            return;
        }

        root._scanningHost = root.host;
        scanner.command = Index.remoteAccessCommand(root.home, root.host);
        scanner.running = true;
    }

    function considerCandidate(text): void {
        if (root._scanningHost !== root.host) {
            // The custom host changed while this scan was in flight -- its
            // result belongs to a host nobody's showing any more.
            root.settleAndMaybeRescan();
            return;
        }

        const prepared = Index.preparePublication(root._snapshot, text, root.home);
        if (!prepared.ok) {
            console.warn("launcher: remote Directory Index (" + root.host + ") rejected scan:", prepared.error);
            root.settleAndMaybeRescan();
            return;
        }

        if (prepared.changed) {
            root._snapshot = prepared.snapshot;
            console.log("launcher: remote Directory Index (" + root.host + ") published revision",
                root._snapshot.revision, "with", root._snapshot.paths.length, "path(s)");
            cacheFile.setText(text);
        }
        root.settleAndMaybeRescan();
    }

    function settleAndMaybeRescan(): void {
        const settled = Index.settleScan(root._schedule);
        root._schedule = settled.schedule;
        if (settled.scan)
            Qt.callLater(root.startScan);
    }

    // Re-scans the instant it can, rather than waiting for the next
    // Directories/Files access schedule tick.
    onEnabledChanged: {
        if (root.enabled)
            root.access();
    }

    // Drops a previous host's result immediately rather than waiting for the
    // new host's own scan to land. `cachePath` recomputes below and
    // `cacheFile` reloads on its own path-binding change.
    onHostChanged: {
        root._snapshot = { paths: [], revision: 0 };
        root._initialized = false;
        root._accessPending = true;
    }

    // Reads the scan straight off stdout -- unlike DirectoryIndex.qml's own
    // scanner, this machine can't read the result back off the remote box's
    // disk (see lib/directoryindex.js's remoteAccessCommand).
    readonly property Process scanner: Process {
        id: scanner

        stdout: StdioCollector {
            id: scanOutput
        }
        stderr: StdioCollector {
            id: scanError
        }

        onExited: exitCode => {
            if (exitCode !== 0) {
                // Unreachable/misconfigured host: logged, not surfaced;
                // `_snapshot` stays whatever it last had.
                const detail = scanError.text.trim();
                console.warn("launcher: remote Directory Index (" + root._scanningHost + ") scan failed with exit",
                    exitCode, detail === "" ? "" : "-- " + detail);
                root.settleAndMaybeRescan();
                return;
            }
            root.considerCandidate(scanOutput.text);
        }
    }

    // Best-effort persistence: publication above already happened from the
    // scan's own stdout, so a write failure here costs only next restart's
    // stale-serving head start, not correctness this session.
    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath
        atomicWrites: true
        printErrors: false
        onLoaded: {
            if (root.cachePath !== "")
                root.initialize(cacheView.text());
        }
        onLoadFailed: {
            if (root.cachePath !== "")
                root.initialize(undefined);
        }
        onSaveFailed: error => console.warn("launcher: remote Directory Index (" + root.host + ") cache persistence failed:", error)
    }

    readonly property FileView routingToggleFile: FileView {
        id: routingToggleView

        path: root.routingTogglePath
        watchChanges: true
        printErrors: false
        onFileChanged: routingToggleView.reload()
        onLoaded: root.routingEnabled = true
        onLoadFailed: root.routingEnabled = false
    }

    readonly property FileView hostFile: FileView {
        id: hostView

        path: root.hostFilePath
        watchChanges: true
        printErrors: false
        onFileChanged: hostView.reload()
        onLoaded: root.host = hostView.text().trim()
        onLoadFailed: root.host = ""
    }
}
