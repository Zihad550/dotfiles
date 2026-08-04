import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs

// Quick Settings: the panel hung under the gear in the bar, holding the
// modules that are controls rather than at-a-glance status -- network,
// bluetooth, the tailscale switch, volume, and the power entries that used to
// open from a click on the battery.
//
// Closes on a click outside (HyprlandFocusGrab), on a second click of the
// gear, or when a row launches something (MenuRow.closeRequested).
PopupWindow {
    id: root

    property Item target
    property bool shown: false

    // Set when the focus grab closes the panel. Hyprland may still deliver that
    // click to the gear underneath, which would immediately reopen what the
    // user just dismissed; toggle() ignores an open that lands right after.
    property double lastCleared: 0

    function toggle(): void {
        if (!shown && Date.now() - lastCleared < 200)
            return;
        shown = !shown;
    }

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown

        onCleared: {
            root.lastCleared = Date.now();
            root.shown = false;
        }
    }

    // Mirrors what elephant/.config/elephant/menus/system.toml (deleted with
    // ticket 19) held -- the old launcher's system menu -- which was a second
    // entry point alongside this one. Kept as the bar's own Quick Settings.
    readonly property var powerActions: [
        {
            icon: "",
            label: "Lock",
            command: ["hyprlock"]
        },
        {
            icon: "󰤄",
            label: "Suspend",
            command: ["systemctl", "suspend"]
        },
        {
            icon: "󰜉",
            label: "Restart",
            command: ["systemctl", "reboot"]
        },
        {
            icon: "󰐥",
            label: "Shutdown",
            command: ["systemctl", "poweroff"]
        },
        {
            icon: "",
            label: "Log out",
            command: ["uwsm", "stop"]
        }
    ]

    anchor.item: target
    // Right-aligned rather than centred on the gear (what Tooltip does): the
    // gear is the last item in the bar, so a centred panel would hang off the
    // right edge of the screen.
    anchor.rect.x: target ? target.width - root.width : 0
    anchor.rect.y: target ? target.height : 0

    visible: shown
    color: "transparent"

    implicitWidth: Theme.menuWidth
    implicitHeight: rows.implicitHeight + 2 * Theme.menuPadding

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        Column {
            id: rows

            // Top/left/right only: the Column's own height drives the popup's.
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: Theme.menuPadding
            spacing: 2

            NetworkItem {
                width: rows.width
                onCloseRequested: root.shown = false
            }

            BluetoothItem {
                width: rows.width
                onCloseRequested: root.shown = false
            }

            // No onCloseRequested: a switch should stay on screen while it
            // settles.
            TailscaleRow {
                width: rows.width
            }

            Volume {
                width: rows.width
                onCloseRequested: root.shown = false
            }

            // Splits the status half from the power half.
            Item {
                width: rows.width
                height: Theme.menuPadding

                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width
                    height: 1
                    color: Theme.foreground
                    opacity: 0.15
                }
            }

            Repeater {
                model: root.powerActions

                delegate: MenuRow {
                    required property var modelData

                    width: rows.width
                    icon: modelData.icon
                    label: modelData.label

                    onClicked: Quickshell.execDetached(modelData.command)
                    onCloseRequested: root.shown = false
                }
            }
        }
    }
}
