pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// All monitor-specific Calendar Panels read this one file-backed singleton.
// Keeping the preference outside a panel prevents the monitors from drifting
// apart and means an explicit choice survives a shell restart.
Singleton {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string stateDir: `${root.home}/.local/state/dotfiles`
    readonly property string weekStartPath: `${root.stateDir}/calendar-week-start`

    // Empty means that no explicit choice has been made. Panels then use the
    // locale's first day until the user activates their W heading.
    property string weekStartSetting: ""
    property bool stateLoaded: false
    property bool pendingWrite: false
    property string queuedWeekStart: ""
    readonly property bool loaded: root.stateLoaded

    function setWeekStart(value: string): void {
        const setting = String(value).trim().toLowerCase();
        if (setting !== "sunday" && setting !== "monday")
            return;
        weekStartSetting = setting;
        if (writeProcess.running) {
            root.queuedWeekStart = setting;
            root.pendingWrite = true;
            return;
        }
        root.writeWeekStart(setting);
    }

    function writeWeekStart(setting: string): void {
        writeProcess.command = [
            "bash", "-c", "mkdir -p \"$1\" && printf '%s\\n' \"$2\" > \"$3\"",
            "bash", root.stateDir, setting, root.weekStartPath
        ];
        writeProcess.running = true;
    }

    function clearWeekStart(): void {
        root.weekStartSetting = "";
        writeProcess.command = ["rm", "-f", root.weekStartPath];
        writeProcess.running = true;
    }

    Process {
        id: writeProcess

        onExited: {
            weekStartFile.reload();
            if (root.pendingWrite) {
                const nextSetting = root.queuedWeekStart;
                root.pendingWrite = false;
                root.queuedWeekStart = "";
                root.writeWeekStart(nextSetting);
            }
        }
    }

    FileView {
        id: weekStartFile

        path: root.weekStartPath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            root.stateLoaded = true;
            const setting = weekStartFile.text().trim().toLowerCase();
            root.weekStartSetting = setting === "sunday" || setting === "monday" ? setting : "";
        }
        onLoadFailed: {
            root.stateLoaded = true;
            root.weekStartSetting = "";
        }
    }
}
