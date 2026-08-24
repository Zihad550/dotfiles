import QtQuick
import Quickshell
import Quickshell.Hyprland
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

    // The window whose application this entry describes.
    readonly property var rep: WorkspaceLabel.representativeOf(root.modelData.toplevels.values, Hyprland.activeToplevel)
    readonly property string repApp: WorkspaceLabel.shortAppName(WorkspaceLabel.appIdOf(root.rep))
    readonly property string label: WorkspaceLabel.labelFor(root.modelData.id, root.modelData.name, root.repApp)

    // A long application id must not push this entry into the clock.
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
