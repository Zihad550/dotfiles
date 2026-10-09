import QtQuick
import Quickshell.Io

// A read-only listing command whose stdout collector exists only while
// `retained`. `settled` reports the output, or "" once released.
Process {
    id: root

    required property bool retained
    readonly property string text: outputLoader.item?.text ?? ""
    // null, or the request waiting for this run to exit: `{ command }`, where
    // an undefined command keeps the bound one.
    property var queued: null
    readonly property bool pending: root.queued !== null
    signal settled(string output)

    // A request landing mid-run is queued, not dropped; the latest queued wins.
    function request(command): void {
        if (!root.retained)
            return;
        if (root.running) {
            root.queued = { command: command ?? root.queued?.command };
            return;
        }
        if (command !== undefined)
            root.command = command;
        root.running = true;
    }

    function drain(): void {
        const next = root.queued;
        root.queued = null;
        if (next !== null)
            root.request(next.command);
    }

    function settle(): void {
        root.settled(root.retained ? root.text : "");
    }

    // Dropped only once no run is live: stopping a run may just signal it,
    // and its exit then drops the collector.
    property bool collecting: false
    onRetainedChanged: {
        if (root.retained) {
            root.collecting = true;
            return;
        }
        root.queued = null;
        const live = root.running;
        root.running = false;
        if (!live)
            root.collecting = false;
        root.settle();
    }
    Component.onCompleted: root.collecting = root.retained

    // Both signals settle: which fires first isn't guaranteed. The drain is
    // deferred because `running` may still read true inside onExited.
    onExited: {
        if (!root.retained)
            root.collecting = false;
        root.settle();
        if (root.pending)
            Qt.callLater(root.drain);
    }

    stdout: outputLoader.item

    readonly property Loader outputLoader: Loader {
        active: root.collecting
        sourceComponent: StdioCollector {
            onStreamFinished: root.settle()
        }
    }
}
