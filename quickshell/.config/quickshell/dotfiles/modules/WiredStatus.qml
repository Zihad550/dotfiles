import QtQuick
import Quickshell.Networking
import qs

// Wired is transport state, not a toggle. Keep it visually in the primary
// hierarchy without giving it a misleading Tile or an actionable hit target.
Item {
    id: root

    readonly property bool connected: Networking.devices.values.some(
        device => device.type === DeviceType.Wired && device.connected
    )

    implicitHeight: Theme.quickSettingsRowHeight
    visible: root.connected

    Rectangle {
        anchors.fill: parent
        radius: 10
        color: Theme.foreground
        opacity: 0.07
    }

    Text {
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        text: "󰀂"
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    Text {
        anchors.left: parent.left
        anchors.leftMargin: 38
        anchors.verticalCenter: parent.verticalCenter
        text: "Wired"
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    Text {
        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        text: "Connected"
        color: Theme.foreground
        opacity: 0.62
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize - 2
        textFormat: Text.PlainText
    }
}
