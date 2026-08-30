pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// The file is the shared source of truth for the Bar's Quick Settings and the
// isolated Session Lock config. Its presence means that idle actions are off.
Singleton {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string stateDir: `${root.home}/.local/state/dotfiles`
    readonly property string togglesDir: `${root.stateDir}/toggles`
    readonly property string togglePath: `${root.togglesDir}/stay-awake`

    property bool enabled: false
    readonly property bool busy: toggleProcess.running

    function toggle(): void {
        if (root.busy)
            return;

        if (root.enabled) {
            toggleProcess.command = ["rm", "-f", root.togglePath];
        } else {
            toggleProcess.command = [
                "bash", "-c", "mkdir -p \"$1\" && touch \"$2\"",
                "bash", root.togglesDir, root.togglePath
            ];
        }
        toggleProcess.running = true;
    }

    Process {
        id: toggleProcess

        onExited: toggleFile.reload()
    }

    FileView {
        id: toggleFile

        path: root.togglePath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.enabled = true
        onLoadFailed: root.enabled = false
    }
}
