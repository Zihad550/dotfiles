import QtQuick
import Quickshell
import Quickshell.Io
import qs

// Flips ~/.local/state/dotfiles/toggles/devcontainer-routing's presence and
// (ticket 05) lets the custom host be edited inline --
// docs/adr/0002-devcontainer-routing-toggle.md. Two lines like Volume.qml: a
// MenuRow header plus extra content in a Column, rather than nesting a field
// inside MenuRow's own fixed chrome. No long-lived Process, unlike Tailscale
// -- the state is just two files' existence and contents.
Column {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string stateDir: `${root.home}/.local/state/dotfiles`
    readonly property string togglesDir: `${root.stateDir}/toggles`
    readonly property string togglePath: `${root.togglesDir}/devcontainer-routing`
    readonly property string hostPath: `${root.stateDir}/devcontainer-host`

    // Mirrors Directories.qml's routingEnabled/devcontainerHost: existence-only
    // for the toggle, a single trimmed line (blank/missing -> default) for the
    // host.
    property bool routingEnabled: false
    property string customHost: ""

    // Keeps the field in sync with the file (this row's own commitHost()
    // reflected back through hostFile's reload, or an external hand-edit)
    // without clobbering a still-in-progress edit.
    onCustomHostChanged: {
        if (!hostInput.activeFocus)
            hostInput.text = root.customHost;
    }

    // Commits on Enter or on losing focus, not per keystroke -- see
    // hostInput below. Argv-passed, not shell-interpolated, same reasoning
    // as the toggle's own mkdir+touch.
    function commitHost(): void {
        const value = hostInput.text.trim();
        Quickshell.execDetached(["bash", "-c", "mkdir -p \"$1\" && printf '%s\\n' \"$2\" > \"$3\"", "bash", root.stateDir, value, root.hostPath]);
        root.customHost = value;
    }

    MenuRow {
        width: root.width

        icon: "󰡨"
        label: "Devcontainer"
        // "devcontainer.devpod" duplicated a third time (Dirs.SSH_HOST,
        // df-herdr-session's DEFAULT_SSH_HOST) -- the two quickshell configs
        // share no code, so this is the accepted fallback copy per the
        // spec/ADR, not drift.
        detail: root.routingEnabled ? (root.customHost || "devcontainer.devpod") : ""

        toggleVisible: true
        toggleOn: root.routingEnabled

        // Flips the file, then the switch itself, rather than waiting on
        // toggleFile's watch -- keeps the switch responsive to the click
        // that caused it instead of round-tripping through the filesystem
        // first. mkdir+touch run as one process, argv rather than
        // shell-interpolated, so a fresh state directory (no toggles/ yet)
        // can't touch before its parent exists and neither path needs
        // quoting.
        onClicked: {
            if (root.routingEnabled)
                Quickshell.execDetached(["rm", "-f", root.togglePath]);
            else
                Quickshell.execDetached(["bash", "-c", "mkdir -p \"$1\" && touch \"$2\"", "bash", root.togglesDir, root.togglePath]);
            root.routingEnabled = !root.routingEnabled;
        }
    }

    // Ticket 05: shown only while routing is on -- editing it while off
    // would suggest an effect it doesn't have, since nothing reads the host
    // file until the toggle is on.
    Item {
        width: root.width
        height: 24
        visible: root.routingEnabled

        Rectangle {
            anchors.fill: parent
            color: Theme.background
            border.color: Theme.accent
            border.width: 1
            radius: 3
            opacity: hostInput.activeFocus ? 1 : 0.4
        }

        Text {
            anchors.left: parent.left
            anchors.leftMargin: 6
            anchors.verticalCenter: parent.verticalCenter
            visible: hostInput.text.length === 0

            text: "devcontainer.devpod"
            color: Theme.foreground
            opacity: 0.35
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            textFormat: Text.PlainText
        }

        TextInput {
            id: hostInput

            anchors.fill: parent
            anchors.leftMargin: 6
            anchors.rightMargin: 6
            verticalAlignment: TextInput.AlignVCenter
            clip: true

            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            selectByMouse: true

            onAccepted: root.commitHost()

            // Turning the toggle off while mid-edit hides this field, which
            // drops its focus the same way tabbing or clicking away does --
            // guarded so that specific path skips the commit instead of
            // saving a half-typed host the user never confirmed.
            onActiveFocusChanged: {
                if (!activeFocus && root.routingEnabled)
                    root.commitHost();
            }
        }
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
