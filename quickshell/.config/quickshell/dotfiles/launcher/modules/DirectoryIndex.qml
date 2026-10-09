import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/directoryindex.js" as Index

QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string indexPath: Index.indexPath(root.home)
    readonly property string scanPath: Index.scanPath(root.home)

    property var _snapshot: ({ paths: [], revision: 0 })
    readonly property var snapshot: root._snapshot
    property var _schedule: Index.idleSchedule()
    property bool _initialized: false
    property bool _accessPending: false
    // FileView compares writes against failed bytes, so reload it before retrying.
    property bool _indexReady: false
    property string _candidatePath: ""
    property var _pendingPublication: null

    function access(): void {
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
            console.warn("launcher: Directory Index rejected persisted data:", started.error);
        else
            root.logPublication(started.snapshot);

        root._accessPending = false;
        if (started.scan)
            root.access();
    }

    function indexLoaded(text): void {
        root._indexReady = true;
        root.initialize(text);
        root.persistPrepared();
    }

    function persistPrepared(): void {
        if (root._indexReady && root._pendingPublication !== null)
            indexView.setText(root._pendingPublication.text);
    }

    function startScan(): void {
        scanner.command = Index.accessCommand(root.home);
        scanner.running = true;
    }

    function readCandidate(): void {
        if (root._candidatePath === root.scanPath)
            candidateView.reload();
        else
            root._candidatePath = root.scanPath;
    }

    function considerCandidate(text): void {
        const prepared = Index.preparePublication(root._snapshot, text, root.home);
        if (!prepared.ok) {
            console.warn("launcher: Directory Index rejected scan:", prepared.error);
            root.finishAttempt(false);
            return;
        }

        if (!prepared.changed) {
            console.log("launcher: Directory Index scan unchanged");
            root.finishAttempt(false);
            return;
        }

        root._pendingPublication = prepared;
        root.persistPrepared();
    }

    function finishAttempt(persisted: bool): void {
        const finished = Index.finishAttempt(root._schedule, root._snapshot,
            root._pendingPublication, persisted);
        const published = finished.snapshot !== root._snapshot;
        root._pendingPublication = null;
        root._schedule = finished.schedule;
        if (published) {
            root._snapshot = finished.snapshot;
            root.logPublication(root._snapshot);
        }
        if (finished.scan)
            Qt.callLater(root.startScan);
    }

    function logPublication(published): void {
        console.log("launcher: Directory Index published revision", published.revision,
            "with", published.paths.length, "path(s)");
    }

    readonly property Process scanner: Process {
        id: scanner

        stderr: StdioCollector {
            id: scanError
        }

        onExited: exitCode => {
            if (exitCode !== 0) {
                const detail = scanError.text.trim();
                console.warn("launcher: Directory Index scan failed with exit", exitCode,
                    detail === "" ? "" : "-- " + detail);
                root.finishAttempt(false);
                return;
            }
            root.readCandidate();
        }
    }

    readonly property FileView indexFile: FileView {
        id: indexView

        path: root.indexPath
        atomicWrites: true
        printErrors: false
        onLoaded: root.indexLoaded(indexView.text())
        onLoadFailed: root.indexLoaded(undefined)
        onSaved: root.finishAttempt(true)
        onSaveFailed: error => {
            root._indexReady = false;
            console.warn("launcher: Directory Index persistence failed:", error);
            root.finishAttempt(false);
            Qt.callLater(indexView.reload);
        }
    }

    readonly property FileView candidateFile: FileView {
        id: candidateView

        path: root._candidatePath
        printErrors: false
        onLoaded: {
            if (root._candidatePath !== "")
                root.considerCandidate(candidateView.text());
        }
        onLoadFailed: {
            if (root._candidatePath === "")
                return;
            console.warn("launcher: Directory Index could not read completed scan");
            root.finishAttempt(false);
        }
    }
}
