import QtQuick
import Quickshell
import Quickshell.Io
import qs

// Flips ~/.local/state/dotfiles/toggles/devcontainer-routing's presence --
// docs/adr/0002-devcontainer-routing-toggle.md. Unlike TailscaleRow there is
// no daemon status to stream: the state is just a file's existence and
// contents, read straight off disk through two FileViews rather than a
// long-lived Process.
MenuRow {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string togglesDir: `${root.home}/.local/state/dotfiles/toggles`
    readonly property string togglePath: `${root.togglesDir}/devcontainer-routing`
    readonly property string hostPath: `${root.home}/.local/state/dotfiles/devcontainer-host`

    // Mirrors Directories.qml's routingEnabled/devcontainerHost: existence-only
    // for the toggle, a single trimmed line (blank/missing -> default) for the
    // host.
    property bool routingEnabled: false
    property string customHost: ""

    icon: "󰡨"
    label: "Devcontainer"
    // "devcontainer.devpod" duplicated a third time (Dirs.SSH_HOST,
    // df-tmux-session's DEFAULT_SSH_HOST) -- the two quickshell configs share
    // no code, so this is the accepted fallback copy per the spec/ADR
    // (docs/adr/0002-devcontainer-routing-toggle.md), not drift.
    detail: root.routingEnabled ? (root.customHost || "devcontainer.devpod") : ""

    toggleVisible: true
    toggleOn: root.routingEnabled

    // Flips the file, then the switch itself, rather than waiting on
    // toggleFile's watch -- keeps the switch responsive to the click that
    // caused it instead of round-tripping through the filesystem first.
    // mkdir+touch run as one process, argv rather than shell-interpolated,
    // so a fresh state directory (no toggles/ yet) can't touch before its
    // parent exists and neither path needs quoting.
    onClicked: {
        if (root.routingEnabled)
            Quickshell.execDetached(["rm", "-f", root.togglePath]);
        else
            Quickshell.execDetached(["bash", "-c", "mkdir -p \"$1\" && touch \"$2\"", "bash", root.togglesDir, root.togglePath]);
        root.routingEnabled = !root.routingEnabled;
    }

    // Existence-only: routing is off, the default, until this file appears.
    // printErrors: false because absence is the common case, not a fault.
    FileView {
        id: toggleFile

        path: root.togglePath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.routingEnabled = true
        onLoadFailed: root.routingEnabled = false
    }

    // Single trimmed line; missing, unreadable, or blank all resolve to "",
    // and `detail` above falls back to devcontainer.devpod for that.
    FileView {
        id: hostFile

        path: root.hostPath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.customHost = hostFile.text().trim()
        onLoadFailed: root.customHost = ""
    }
}
