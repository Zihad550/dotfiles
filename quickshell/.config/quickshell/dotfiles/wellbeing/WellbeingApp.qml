import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "usage.js" as Usage

Scope {
    id: root

    required property bool locked
    property bool shown: false
    property bool ready: false
    property bool historyReady: false
    property bool dirty: false
    property string error: ""
    property var store: Usage.empty()
    property double now: Date.now()
    property double previousWall: Date.now()
    property string previousApp: ""
    readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/df-wellbeing"
    property string focusedApp: ToplevelManager.activeToplevel?.appId || ""
    property bool inputIdle: idle.isIdle
    readonly property bool tracking: ready && !store.paused && !locked && !inputIdle
    readonly property string currentApp: tracking ? focusedApp : ""

    function sample(): void {
        const wall = Date.now();
        const elapsed = clock.restartMs();
        // Large gaps and wall-clock jumps must never become application time.
        if (root.ready && elapsed >= 0 && elapsed <= 15000 && Math.abs(wall - root.previousWall - elapsed) < 2000) {
            const next = Usage.record(root.store, root.previousApp, root.previousWall, root.previousWall + elapsed);
            if (next !== root.store) {
                root.store = next;
                root.dirty = true;
            }
        }
        root.previousWall = wall;
        root.previousApp = root.currentApp;
        root.now = wall;
    }

    function save(): void {
        if (root.ready && root.historyReady && root.dirty)
            history.setText(JSON.stringify(root.store));
    }

    function togglePause(): void {
        root.sample();
        root.store = Object.assign({}, root.store, { paused: !root.store.paused });
        root.dirty = true;
        root.save();
    }

    function open(): void {
        root.sample();
        if (root.shown) {
            const window = ToplevelManager.toplevels.values.find(window => window.title === "Wellbeing");
            if (window) {
                window.minimized = false;
                window.activate();
            }
        }
        root.shown = true;
    }

    // Sampling updates store, which also feeds tracking's pause binding.
    onCurrentAppChanged: Qt.callLater(root.sample)
    ElapsedTimer { id: clock }
    IdleMonitor {
        id: idle
        timeout: 300
        respectInhibitors: false
    }

    Process {
        id: directory
        command: ["mkdir", "-p", root.stateDir]
        running: true
        onExited: code => {
            if (code === 0)
                history.path = root.stateDir + "/usage.json";
            else
                root.error = "Cannot create the usage history directory. Tracking is disabled.";
        }
    }

    FileView {
        id: history
        onLoaded: {
            root.historyReady = true;
            if (root.ready)
                return;
            try {
                root.store = Usage.parse(history.text());
                root.ready = true;
                root.sample();
            } catch (error) {
                root.error = "Cannot read usage history. Tracking is disabled to preserve the file: " + error;
            }
        }
        onLoadFailed: error => {
            root.historyReady = true;
            if (root.ready)
                return;
            if (error === FileViewError.FileNotFound) {
                root.ready = true;
                root.sample();
            } else {
                root.error = "Cannot load usage history. Tracking is disabled.";
            }
        }
        onSaved: root.error = ""
        onSaveFailed: error => {
            root.error = "Cannot save usage history. Totals are only in memory; another save will be attempted.";
            // FileView caches failed bytes and skips identical writes until reloaded.
            root.historyReady = false;
            Qt.callLater(history.reload);
        }
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: root.sample()
    }
    Timer {
        interval: 30000
        running: true
        repeat: true
        onTriggered: root.save()
    }
    Component.onDestruction: root.save()

    LazyLoader {
        active: root.shown
        WellbeingWindow { app: root }
    }
    IpcHandler {
        target: "wellbeing"
        function open(): void { root.open(); }
        function close(): void { root.shown = false; }
    }
}
