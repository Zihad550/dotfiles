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

    // The Wi-Fi Page (ticket 03) replaces the rows below in this same window
    // -- see Page in CONTEXT.md. Reset whenever the panel closes, by whatever
    // path, so a reopen always starts at the rows and the scanner it gates
    // (WifiPage.active) can never keep running behind a closed panel.
    property bool wifiPageShown: false

    // Set when the focus grab closes the panel. Hyprland may still deliver that
    // click to the gear underneath, which would immediately reopen what the
    // user just dismissed; toggle() ignores an open that lands right after.
    property double lastCleared: 0

    function toggle(): void {
        if (!shown && Date.now() - lastCleared < 200)
            return;
        shown = !shown;
    }

    onShownChanged: {
        if (!shown)
            wifiPageShown = false;
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
    implicitHeight: (root.wifiPageShown ? wifiPage.implicitHeight : rows.implicitHeight) + 2 * Theme.menuPadding

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        // Hidden behind this wrapper rather than by setting the Column's own
        // `visible` false -- a Column stops updating implicitHeight while
        // invisible, and the popup's height above reads it the instant the
        // Page takes over.
        Item {
            id: rowsWrapper

            visible: !root.wifiPageShown
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: Theme.menuPadding

            Column {
                id: rows

                anchors.left: parent.left
                anchors.right: parent.right
                spacing: 2

                NetworkItem {
                    width: rows.width
                    // Opening the Wi-Fi Page must not close the panel it is
                    // drawn in -- same reasoning as TailscaleRow's
                    // onCloseRequested comment.
                    onRequestWifiPage: root.wifiPageShown = true
                }

                // Ticket 06: status only, visible only while a cable is in.
                // No onCloseRequested -- it has no click to wire one to.
                WiredRow {
                    width: rows.width
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

                // Same reasoning as TailscaleRow above -- the row itself keeps
                // showing the flipped state as it settles.
                DevcontainerRoutingRow {
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

        Item {
            id: wifiPageWrapper

            visible: root.wifiPageShown
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: Theme.menuPadding

            WifiPage {
                id: wifiPage

                anchors.left: parent.left
                anchors.right: parent.right
                active: root.wifiPageShown

                onBack: root.wifiPageShown = false
                // Ticket 09: the nmtui hand-off closes the whole panel, the
                // same escape hatch BluetoothItem's closeRequested already
                // uses for bluetui.
                onCloseRequested: root.shown = false
            }
        }
    }
}
