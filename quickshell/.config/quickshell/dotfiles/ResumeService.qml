pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// logind's PrepareForSleep(false), for state that goes stale across a suspend.
// Same `gdbus monitor` the Session Lock uses -- see lock/shell.qml.
Singleton {
    id: root

    signal resumed()

    Process {
        id: sleepMonitor

        running: true
        command: ["gdbus", "monitor", "--system", "--dest", "org.freedesktop.login1",
            "--object-path", "/org/freedesktop/login1"]

        stdout: SplitParser {
            onRead: line => {
                if (/PrepareForSleep \(\s*false\s*,?\s*\)/.test(line))
                    root.resumed();
            }
        }

        onExited: retryTimer.start()
    }

    Timer {
        id: retryTimer
        interval: 5000
        onTriggered: sleepMonitor.running = true
    }
}
