pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property bool installed: false
    property bool active: false
    property bool changing: false
    property bool refreshing: false
    readonly property bool busy: root.changing || root.refreshing

    function refresh(): void {
        if (root.busy)
            return;
        root.refreshing = true;
        statusProcess.running = true;
    }

    function toggle(): void {
        if (root.busy || !root.installed)
            return;
        root.changing = true;
        toggleProcess.command = ["systemctl", root.active ? "stop" : "start", "kanata.service"];
        toggleProcess.running = true;
    }

    Component.onCompleted: root.refresh()

    Process {
        id: statusProcess

        command: ["systemctl", "show", "kanata.service", "--property=LoadState,ActiveState"]
        stdout: StdioCollector {
            id: statusOutput
            waitForEnd: true
        }
        stderr: StdioCollector {}
        onExited: exitCode => {
            const lines = statusOutput.text.trim().split("\n");
            root.installed = exitCode === 0 && lines.includes("LoadState=loaded");
            root.active = root.installed && lines.includes("ActiveState=active");
            root.refreshing = false;
        }
    }

    Process {
        id: toggleProcess

        stderr: StdioCollector {
            id: toggleError
            waitForEnd: true
        }
        onExited: exitCode => {
            root.changing = false;
            if (exitCode !== 0)
                Quickshell.execDetached(["notify-send", "-u", "critical", "Kanata",
                    toggleError.text.trim() || "Could not change the Kanata service state."]);
            root.refresh();
        }
    }
}
