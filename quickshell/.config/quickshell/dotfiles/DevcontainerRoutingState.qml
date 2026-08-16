import QtQuick
import Quickshell
import Quickshell.Io

// The file-backed routing state is shared by the primary Tile and its Page.
// Keeping the writers here prevents rapid activation from racing two shell
// commands and leaves FileView as the settled source of truth.
QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string stateDir: `${root.home}/.local/state/dotfiles`
    readonly property string togglesDir: `${root.stateDir}/toggles`
    readonly property string togglePath: `${root.togglesDir}/devcontainer-routing`
    readonly property string hostPath: `${root.stateDir}/devcontainer-host`
    readonly property string defaultHost: "devcontainer.devpod"
    readonly property string resolvedHost: root.customHost || root.defaultHost

    property bool routingEnabled: false
    property string customHost: ""
    property bool pendingHostWrite: false
    property string queuedHost: ""

    readonly property bool busy: toggleProcess.running

    function toggle(): void {
        if (root.busy)
            return;

        if (root.routingEnabled) {
            root.toggleProcess.command = ["rm", "-f", root.togglePath];
        } else {
            root.toggleProcess.command = [
                "bash", "-c", "mkdir -p \"$1\" && touch \"$2\"",
                "bash", root.togglesDir, root.togglePath
            ];
        }
        toggleProcess.running = true;
    }

    function writeHost(value: string): void {
        root.hostProcess.command = [
            "bash", "-c", "mkdir -p \"$1\" && printf '%s\\n' \"$2\" > \"$3\"",
            "bash", root.stateDir, value, root.hostPath
        ];
        root.hostProcess.running = true;
    }

    function commitHost(value: string): void {
        if (!root.routingEnabled)
            return;

        const trimmed = value.trim();
        if (root.hostProcess.running) {
            root.queuedHost = trimmed;
            root.pendingHostWrite = true;
            return;
        }
        root.writeHost(trimmed);
    }

    readonly property Process toggleProcess: Process {
        id: toggleProcess

        onExited: root.toggleFile.reload()
    }

    readonly property Process hostProcess: Process {
        id: hostProcess

        onExited: {
            root.hostFile.reload();
            if (root.pendingHostWrite) {
                const nextHost = root.queuedHost;
                root.pendingHostWrite = false;
                root.queuedHost = "";
                root.writeHost(nextHost);
            }
        }
    }

    readonly property FileView toggleFile: FileView {
        id: toggleFile

        path: root.togglePath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.routingEnabled = true
        onLoadFailed: root.routingEnabled = false
    }

    readonly property FileView hostFile: FileView {
        id: hostFile

        path: root.hostPath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.customHost = hostFile.text().trim()
        onLoadFailed: root.customHost = ""
    }
}
