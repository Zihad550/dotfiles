pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Probe the D-Bus service before loading Quickshell.Bluetooth. The latter
// logs a warning while initializing when BlueZ is not present at all.
Singleton {
    id: root

    property bool available: false

    function probe(): void {
        if (!probeProcess.running)
            probeProcess.running = true;
    }

    Process {
        id: probeProcess

        command: ["busctl", "--system", "--quiet", "status", "org.bluez"]
        running: true

        stderr: StdioCollector {}

        onExited: exitCode => {
            root.available = exitCode === 0;
            if (!root.available)
                retry.start();
        }
    }

    Timer {
        id: retry

        interval: 5000
        onTriggered: root.probe()
    }
}
