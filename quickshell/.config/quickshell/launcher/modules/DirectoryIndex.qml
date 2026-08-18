import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/directoryindex.js" as Index

QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string cachePath: Index.cachePath(root.home)
    readonly property string scanPath: Index.scanPath(root.home)

    property var _snapshot: ({ paths: [], revision: 0 })
    readonly property var snapshot: root._snapshot
    property var _schedule: Index.idleSchedule()
    property bool _initialized: false
    property string _candidatePath: ""
    property var _pendingSnapshot: null

    function access(): void {
        const requested = Index.request(root._schedule);
        root._schedule = requested.schedule;
        if (requested.scan)
            root.startScan();
    }

    function initialize(text): void {
        if (root._initialized)
            return;
        root._initialized = true;

        const started = Index.startup(text, root.home);
        root._snapshot = started.snapshot;
        if (started.error !== "")
            console.warn("launcher: Directory Index rejected persisted data:", started.error);
        else
            root.logPublication(started.snapshot);

        if (started.scan)
            root.access();
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
        const checked = Index.candidate(text, root.home);
        if (!checked.ok) {
            console.warn("launcher: Directory Index rejected scan:", checked.error);
            root.finishAttempt();
            return;
        }

        const published = Index.publish(root._snapshot, text, root.home);
        if (published === root._snapshot) {
            console.log("launcher: Directory Index scan unchanged");
            root.finishAttempt();
            return;
        }

        root._pendingSnapshot = published;
        cacheView.setText(text);
    }

    function finishAttempt(): void {
        root._pendingSnapshot = null;
        const settled = Index.settle(root._schedule);
        root._schedule = settled.schedule;
        if (settled.scan)
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
                root.finishAttempt();
                return;
            }
            root.readCandidate();
        }
    }

    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath
        atomicWrites: true
        printErrors: false
        onLoaded: root.initialize(cacheView.text())
        onLoadFailed: root.initialize(undefined)
        onSaved: {
            root._snapshot = root._pendingSnapshot;
            root.logPublication(root._snapshot);
            root.finishAttempt();
        }
        onSaveFailed: error => {
            console.warn("launcher: Directory Index persistence failed:", error);
            root.finishAttempt();
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
            root.finishAttempt();
        }
    }
}
