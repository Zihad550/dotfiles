import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs
import "lib/windowNaming.js" as WindowNaming
import "lib/workspaceLabel.js" as WorkspaceLabel

// A numbered workspace's bar entry: the name, always click-to-switch
// regardless of layout or window count, plus an arrow that appears only on
// scrolling layout with 2+ windows and opens a Flyout of that workspace's
// windows. See .scratch/workspace-window-flyout/spec.md.
//
// The text is a Workspace Label derived from the windows on the workspace,
// never a compositor rename -- see docs/adr/0013-workspace-labels-derived-in-bar.md.
Item {
    id: root

    required property var modelData

    readonly property int windowCount: root.modelData.toplevels.values.length
    readonly property bool isActive: root.modelData.active
    readonly property bool empty: root.windowCount === 0

    // The window whose identity this entry describes, and where that
    // application sits -- from a source that application actually exposes
    // (issue #102): a Zed window's Project Root comes off its live title, a
    // Ghostty window's directory out of /proc, every other application is
    // asked for nothing. The path resolves out of band, so a label may
    // briefly trail a `cd` in an already-focused terminal -- accepted by the
    // ADR.
    readonly property var rep: WorkspaceLabel.representativeOf(root.modelData.toplevels.values, Hyprland.activeToplevel)
    readonly property string repAppId: WorkspaceLabel.appIdOf(root.rep)
    readonly property string repAddress: root.rep?.address ?? ""
    readonly property string repKey: root.repAddress + ":" + String(root.rep?.lastIpcObject?.pid ?? "")
    readonly property string repApp: WorkspaceLabel.shortAppName(root.repAppId)
    // Reading the toplevel's own title keeps this reactive: Zed retitles on
    // project switches and the label follows with no focus change or polling.
    readonly property string repTitle: root.rep?.title ?? ""
    readonly property string repRoot: WorkspaceLabel.isZed(root.repAppId) ? WorkspaceLabel.projectRootFromTitle(root.repTitle) : ""
    property string repPath: ""
    readonly property string repDir: root.repRoot || (WorkspaceLabel.isGhostty(root.repAppId) ? root.repPath : "")
    readonly property string label: WorkspaceLabel.labelFor(root.modelData.id, root.modelData.name, root.repApp, root.repDir)

    // A deep project path must not push this entry into the clock; degrade
    // to eliding the middle of the label rather than growing forever.
    readonly property int maxLabelWidth: 360

    // Not a named HyprlandWorkspace property in the installed Quickshell
    // build -- only reachable through the raw IPC passthrough. See
    // docs/adr/0005-workspace-tiled-layout-live-ipc.md.
    readonly property bool scrolling: root.modelData.lastIpcObject?.tiledLayout === "scrolling"
    readonly property bool hasFlyout: root.scrolling && root.windowCount > 1

    // The arrow disappearing must take any open flyout with it, same as
    // SpecialWorkspaces' onCollapsibleChanged.
    onHasFlyoutChanged: {
        if (!root.hasFlyout)
            flyout.shown = false;
    }

    // repKey, not repAddress: a pid can arrive from the IPC fetch after the
    // window itself does, and that too is worth one re-resolve.
    Component.onCompleted: root.resolveCwd()
    onRepKeyChanged: root.resolveCwd()

    function resolveCwd(): void {
        root.repPath = "";
        // The process cwd is Ghostty's source alone; other applications are
        // never probed, and a Zed window's root comes from its title above.
        if (!WorkspaceLabel.isGhostty(root.repAppId))
            return;
        // A readlink still exiting means its result is for an older
        // representative; onExited re-runs for whatever repKey wants then.
        if (cwdProc.running)
            return;
        const pid = root.rep?.lastIpcObject?.pid;
        cwdProc.requestedFor = root.repKey;
        if (!pid)
            return;
        cwdProc.command = WorkspaceLabel.cwdCommand(pid);
        cwdProc.running = true;
    }

    Process {
        id: cwdProc

        // What the in-flight readlink was asked for. Output is only applied
        // while the request still matches the representative -- otherwise a
        // slow readlink for a window that stopped being described could
        // stamp its directory onto another workspace's label.
        property string requestedFor: ""

        stdout: SplitParser {
            onRead: line => {
                if (root.repKey !== cwdProc.requestedFor)
                    return;
                root.repPath = WorkspaceLabel.basenameOf(line.trim());
            }
        }

        onExited: {
            if (root.repKey !== requestedFor)
                root.resolveCwd();
        }
    }

    implicitWidth: Math.max(content.implicitWidth, 9) + 12 // padding: 0 6px
    implicitHeight: Theme.barHeight

    Row {
        id: content

        anchors.centerIn: parent
        spacing: 3

        Text {
            id: name

            width: Math.min(implicitWidth, root.maxLabelWidth)
            anchors.verticalCenter: parent.verticalCenter
            text: root.label
            elide: Text.ElideMiddle
            color: Theme.foreground
            opacity: root.isActive ? 1.0 : (root.empty ? 0.5 : 0.75)
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            font.bold: root.isActive
            textFormat: Text.PlainText

            MouseArea {
                anchors.fill: parent
                onClicked: root.modelData.activate()
            }
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter

            visible: root.hasFlyout
            // Same glyph SpecialWorkspaces uses for its own dropdown arrow.
            text: flyout.shown ? "▴" : "▾"
            color: flyout.shown ? Theme.accent : Theme.foreground
            opacity: flyout.shown ? 1.0 : 0.6
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            textFormat: Text.PlainText

            MouseArea {
                anchors.fill: parent
                onClicked: flyout.toggle()
            }
        }
    }

    Flyout {
        id: flyout

        target: root
        model: root.modelData.toplevels.values

        delegate: MenuRow {
            required property var modelData

            readonly property string appId: WorkspaceLabel.appIdOf(modelData)

            width: parent.width
            icon: modelData === Hyprland.activeToplevel ? "•" : " "
            label: WindowNaming.nameFor(modelData.title, appId)
            detail: appId

            onClicked: {
                // HyprlandToplevel itself has no activate() on the installed
                // Quickshell build (0.3.0) -- only its Wayland handle does.
                const wayland = modelData.wayland;
                if (!wayland) {
                    console.warn("workspace flyout: no Wayland handle to activate for", modelData.title || modelData.address);
                    return;
                }
                wayland.activate();
            }
            onCloseRequested: flyout.shown = false
        }
    }
}
