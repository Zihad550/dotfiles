import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs

// waybar: "hyprland/workspaces" with format "{name}" and on-click "activate".
// Styling from style.css: active = opacity 1 + bold, empty = 0.5, else 0.75.
Row {
    id: root

    property var barScreen

    readonly property HyprlandMonitor monitor: root.barScreen ? Hyprland.monitorFor(root.barScreen) : null

    // Hyprland keeps the open special workspace in a slot separate from the
    // monitor's active workspace, so HyprlandWorkspace.active is structurally
    // never true for one. Track it off the activespecial event instead.
    property string activeSpecial: ""

    // Events only report transitions, so seed from the monitor's IPC snapshot
    // in case a special workspace is already open when the bar starts.
    Component.onCompleted: root.activeSpecial = root.monitor?.lastIpcObject?.specialWorkspace?.name ?? ""

    function isSpecialActive(name: string): bool {
        if (root.activeSpecial === "")
            return false;
        // Hyprland has reported this name both bare and "special:"-prefixed
        // depending on version; accept either.
        return name === root.activeSpecial || name === `special:${root.activeSpecial}`;
    }

    // 1.5px margin per side in waybar -> 3px between buttons.
    spacing: 3
    height: Theme.barHeight

    Connections {
        target: Hyprland

        // activespecial>>workspacename,monitorname
        // activespecialv2>>workspaceid,workspacename,monitorname
        // Both send an empty workspace name when the special is closed.
        function onRawEvent(event) {
            const v2 = event.name === "activespecialv2";
            if (!v2 && event.name !== "activespecial")
                return;

            // The event instance is reused once this handler returns, so pull
            // everything out now.
            const args = event.parse(v2 ? 3 : 2);
            const workspace = v2 ? args[1] : args[0];
            const monitorName = v2 ? args[2] : args[1];

            if (root.monitor && monitorName !== root.monitor.name)
                return;

            root.activeSpecial = workspace;
        }
    }

    Repeater {
        model: Hyprland.workspaces.values.filter(ws => !root.monitor || ws.monitor === root.monitor)

        delegate: Item {
            id: button

            required property var modelData

            readonly property bool empty: button.modelData.toplevels.values.length === 0
            readonly property bool isActive: button.modelData.active || root.isSpecialActive(button.modelData.name)

            implicitWidth: Math.max(name.implicitWidth, 9) + 12 // padding: 0 6px
            implicitHeight: Theme.barHeight

            Text {
                id: name

                anchors.centerIn: parent
                // "special:magic" -> "magic". The unnamed special workspace is
                // just "special", which has no prefix to strip.
                text: button.modelData.name.replace(/^special:/, "")
                color: Theme.foreground
                opacity: button.isActive ? 1.0 : (button.empty ? 0.5 : 0.75)
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize
                font.bold: button.isActive
                textFormat: Text.PlainText
            }

            MouseArea {
                anchors.fill: parent
                onClicked: button.modelData.activate()
            }
        }
    }
}
